import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { isKnownModel } from "./models.js";
import type { Route } from "./routing.js";

/**
 * Routing profiles: which agent role and which model handle each SDLC stage.
 * "default" is the profile used unless another is active. It starts as Garry's
 * values (garry.routing.json when the folder has one, else the built-in below);
 * change it like any other and it is saved to routing/default.json in the
 * registry, and reset brings Garry's values back. Other profiles live next to
 * it (routing/<name>.json). A feature can pick a profile with `routing: <name>`
 * in its frontmatter.
 */

export interface RoutingProfile {
  name: string;
  description?: string;
  defaults: Route;
  stages: Record<string, Route>;
  /** the default profile with Garry's own values (not changed in this registry) */
  builtin?: boolean;
}

export const STAGE_NAMES = ["spec", "plan", "design", "implement", "review", "test", "integrate"] as const;

export const DEFAULT_PROFILE: RoutingProfile = {
  name: "default",
  description: "The strongest model thinks and reviews, a fast one writes the code",
  builtin: true,
  defaults: { agent: "garry-dev", model: "claude-sonnet-5-5" },
  stages: {
    spec: { agent: "garry-analyst", model: "claude-opus-5-5" },
    plan: { agent: "garry-analyst", model: "claude-opus-5-5" },
    design: { agent: "garry-analyst", model: "claude-opus-5-5" },
    implement: { agent: "garry-dev", model: "claude-haiku-5-5" },
    review: { agent: "garry-reviewer", model: "claude-opus-5-5" },
    test: { agent: "garry-dev", model: "claude-sonnet-5-5" },
    integrate: { agent: "garry-dev", model: "claude-sonnet-5-5" },
  },
};

export class RoutingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const RouteSchema = z.object({
  agent: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/, "agent: lowercase letters, digits and dashes"),
  model: z.string().refine(isKnownModel, "model: not one Garry knows (see /api/models)"),
});
const ProfileSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/, "name: lowercase letters, digits and dashes"),
  description: z.string().max(300).optional(),
  defaults: RouteSchema,
  stages: z.partialRecord(z.enum(STAGE_NAMES), RouteSchema).default({}),
});

const dir = (registry: string) => join(registry, "routing");
const file = (registry: string, name: string) => join(dir(registry), `${name}.json`);
const indexFile = (registry: string) => join(dir(registry), "index.json");

/** Garry's values for the default profile: the folder's garry.routing.json when there is one, else the built-in. */
export function garryDefault(legacyFile?: string): RoutingProfile {
  if (legacyFile && existsSync(legacyFile)) {
    try {
      const j = JSON.parse(readFileSync(legacyFile, "utf8")) as Partial<RoutingProfile>;
      return { ...DEFAULT_PROFILE, defaults: j.defaults ?? DEFAULT_PROFILE.defaults, stages: j.stages ?? DEFAULT_PROFILE.stages };
    } catch {
      /* unreadable: the built-in */
    }
  }
  return DEFAULT_PROFILE;
}

/** The default profile: as changed in this registry (routing/default.json), else Garry's values. */
export function defaultProfile(legacyFile?: string, registry?: string): RoutingProfile {
  if (registry && existsSync(file(registry, "default"))) {
    try {
      const r = ProfileSchema.safeParse(JSON.parse(readFileSync(file(registry, "default"), "utf8")));
      if (r.success) return { ...r.data, name: "default" };
    } catch {
      /* unreadable: Garry's values */
    }
  }
  return garryDefault(legacyFile);
}

export function activeProfileName(registry: string): string {
  try {
    const name = (JSON.parse(readFileSync(indexFile(registry), "utf8")) as { active?: string }).active;
    return name && (name === "default" || existsSync(file(registry, name))) ? name : "default";
  } catch {
    return "default";
  }
}

export function readProfile(registry: string, name: string, legacyFile?: string): RoutingProfile | null {
  if (name === "default") return defaultProfile(legacyFile, registry);
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(name) || !existsSync(file(registry, name))) return null;
  const r = ProfileSchema.safeParse(JSON.parse(readFileSync(file(registry, name), "utf8")));
  return r.success ? r.data : null;
}

export function listProfiles(registry: string, legacyFile?: string): { active: string; profiles: RoutingProfile[] } {
  const custom = existsSync(dir(registry))
    ? readdirSync(dir(registry))
        .filter((f) => f.endsWith(".json") && f !== "index.json" && f !== "default.json")
        .flatMap((f) => {
          const p = readProfile(registry, f.slice(0, -5));
          return p ? [p] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  return { active: activeProfileName(registry), profiles: [defaultProfile(legacyFile, registry), ...custom] };
}

/** Writes a profile. With from, it starts as a copy of that profile. */
export function saveProfile(registry: string, input: unknown, opts: { replace?: boolean; legacyFile?: string } = {}): RoutingProfile {
  const raw = (input ?? {}) as Partial<RoutingProfile> & { from?: string };
  const source = raw.from ? readProfile(registry, raw.from, opts.legacyFile) : null;
  if (raw.from && !source) throw new RoutingError(`no profile ${raw.from} to copy`, 404);
  const r = ProfileSchema.safeParse({
    name: String(raw.name ?? "").trim(),
    description: raw.description?.trim() || (source ? `Started from ${source.name}` : undefined),
    defaults: raw.defaults ?? source?.defaults,
    stages: raw.stages ?? source?.stages ?? {},
  });
  if (!r.success) throw new RoutingError(r.error.issues.map((i) => i.message).join("; "), 400);
  // default always exists (with Garry's values until changed): it is changed, never created
  if ((r.data.name === "default" || existsSync(file(registry, r.data.name))) && !opts.replace) throw new RoutingError(`profile ${r.data.name} already exists`, 409);
  mkdirSync(dir(registry), { recursive: true });
  writeFileSync(file(registry, r.data.name), JSON.stringify(r.data, null, 2) + "\n");
  return r.data;
}

/** Changes one stage (or the fallback, stage "defaults") of a profile, the default one included. */
export function setStageRoute(registry: string, name: string, stage: string, route: Partial<Route>, legacyFile?: string): RoutingProfile {
  const p = readProfile(registry, name, legacyFile);
  if (!p) throw new RoutingError(`no profile ${name}`, 404);
  const current = stage === "defaults" ? p.defaults : (p.stages[stage] ?? p.defaults);
  const next = { agent: route.agent ?? current.agent, model: route.model ?? current.model };
  const { builtin: _, ...rest } = p;
  return saveProfile(registry, stage === "defaults" ? { ...rest, defaults: next } : { ...rest, stages: { ...rest.stages, [stage]: next } }, { replace: true });
}

export function setActiveProfile(registry: string, name: string): void {
  if (name !== "default" && !readProfile(registry, name)) throw new RoutingError(`no profile ${name}`, 404);
  mkdirSync(dir(registry), { recursive: true });
  writeFileSync(indexFile(registry), JSON.stringify({ active: name }, null, 2) + "\n");
}

/** Removes a profile; for default, puts Garry's values back. */
export function removeProfile(registry: string, name: string): void {
  if (name === "default") {
    if (existsSync(file(registry, "default"))) unlinkSync(file(registry, "default"));
    return;
  }
  if (!readProfile(registry, name)) throw new RoutingError(`no profile ${name}`, 404);
  unlinkSync(file(registry, name));
  if (activeProfileName(registry) === "default") setActiveProfile(registry, "default");
}
