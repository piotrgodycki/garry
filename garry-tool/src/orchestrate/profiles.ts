import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { isKnownModel } from "./models.js";
import type { Route } from "./routing.js";

/**
 * Routing profiles: which agent role and which model handle each SDLC stage.
 * "default" is Garry's example (garry.routing.json when the folder has one, else
 * the built-in below) and is not edited: duplicate it into a profile of your own
 * in the registry (routing/<name>.json), change that, and make it active. A
 * feature can pick a profile with `routing: <name>` in its frontmatter.
 */

export interface RoutingProfile {
  name: string;
  description?: string;
  defaults: Route;
  stages: Record<string, Route>;
  /** the example: read only */
  builtin?: boolean;
}

export const STAGE_NAMES = ["spec", "plan", "design", "implement", "review", "test", "integrate"] as const;

export const DEFAULT_PROFILE: RoutingProfile = {
  name: "default",
  description: "Garry's example: the strongest model thinks and reviews, a fast one writes the code",
  builtin: true,
  defaults: { agent: "garry-dev", model: "claude-sonnet-4-6" },
  stages: {
    spec: { agent: "garry-analyst", model: "claude-opus-4-8" },
    plan: { agent: "garry-analyst", model: "claude-opus-4-8" },
    design: { agent: "garry-analyst", model: "claude-opus-4-8" },
    implement: { agent: "garry-dev", model: "claude-haiku-4-5-20251001" },
    review: { agent: "garry-reviewer", model: "claude-opus-4-8" },
    test: { agent: "garry-dev", model: "claude-sonnet-4-6" },
    integrate: { agent: "garry-dev", model: "claude-sonnet-4-6" },
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
  name: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,62}$/, "name: lowercase letters, digits and dashes")
    .refine((n) => n !== "default", "name: default is Garry's example; pick another name"),
  description: z.string().max(300).optional(),
  defaults: RouteSchema,
  stages: z.partialRecord(z.enum(STAGE_NAMES), RouteSchema).default({}),
});

const dir = (registry: string) => join(registry, "routing");
const file = (registry: string, name: string) => join(dir(registry), `${name}.json`);
const indexFile = (registry: string) => join(dir(registry), "index.json");

/** The example profile: the folder's garry.routing.json when there is one, else the built-in. */
export function defaultProfile(legacyFile?: string): RoutingProfile {
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

export function activeProfileName(registry: string): string {
  try {
    const name = (JSON.parse(readFileSync(indexFile(registry), "utf8")) as { active?: string }).active;
    return name && (name === "default" || existsSync(file(registry, name))) ? name : "default";
  } catch {
    return "default";
  }
}

export function readProfile(registry: string, name: string, legacyFile?: string): RoutingProfile | null {
  if (name === "default") return defaultProfile(legacyFile);
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(name) || !existsSync(file(registry, name))) return null;
  const r = ProfileSchema.safeParse(JSON.parse(readFileSync(file(registry, name), "utf8")));
  return r.success ? r.data : null;
}

export function listProfiles(registry: string, legacyFile?: string): { active: string; profiles: RoutingProfile[] } {
  const custom = existsSync(dir(registry))
    ? readdirSync(dir(registry))
        .filter((f) => f.endsWith(".json") && f !== "index.json")
        .flatMap((f) => {
          const p = readProfile(registry, f.slice(0, -5));
          return p ? [p] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  return { active: activeProfileName(registry), profiles: [defaultProfile(legacyFile), ...custom] };
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
  if (existsSync(file(registry, r.data.name)) && !opts.replace) throw new RoutingError(`profile ${r.data.name} already exists`, 409);
  mkdirSync(dir(registry), { recursive: true });
  writeFileSync(file(registry, r.data.name), JSON.stringify(r.data, null, 2) + "\n");
  return r.data;
}

/** Changes one stage (or the fallback, stage "defaults") of a profile of your own. */
export function setStageRoute(registry: string, name: string, stage: string, route: Partial<Route>): RoutingProfile {
  if (name === "default") throw new RoutingError("default is Garry's example and stays as it is; duplicate it into a profile of your own", 400);
  const p = readProfile(registry, name);
  if (!p) throw new RoutingError(`no profile ${name}`, 404);
  const current = stage === "defaults" ? p.defaults : (p.stages[stage] ?? p.defaults);
  const next = { agent: route.agent ?? current.agent, model: route.model ?? current.model };
  return saveProfile(registry, stage === "defaults" ? { ...p, defaults: next } : { ...p, stages: { ...p.stages, [stage]: next } }, { replace: true });
}

export function setActiveProfile(registry: string, name: string): void {
  if (name !== "default" && !readProfile(registry, name)) throw new RoutingError(`no profile ${name}`, 404);
  mkdirSync(dir(registry), { recursive: true });
  writeFileSync(indexFile(registry), JSON.stringify({ active: name }, null, 2) + "\n");
}

export function removeProfile(registry: string, name: string): void {
  if (name === "default") throw new RoutingError("default is Garry's example and cannot be removed", 400);
  if (!readProfile(registry, name)) throw new RoutingError(`no profile ${name}`, 404);
  unlinkSync(file(registry, name));
  if (activeProfileName(registry) === "default") setActiveProfile(registry, "default");
}
