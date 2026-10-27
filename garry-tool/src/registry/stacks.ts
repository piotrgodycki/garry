import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { StackSchema, checkStack, type Stack, type StackIssue } from "../../../garry-registry/src/stacks.js";
import { listManifests } from "../sync/registryIO.js";

/**
 * The registry's tech stacks, one per stacks/<name>.yaml. Used by garry stack,
 * the dashboard's Stacks page and the service form (stackRef).
 */

export class StackError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const dir = (registry: string) => join(registry, "stacks");
const file = (registry: string, name: string) => join(dir(registry), `${name}.yaml`);

/** Every stack that parses, with the services built on it and what its check says. */
export function listStacks(registry: string): (Stack & { usedBy: string[]; issues: StackIssue[] })[] {
  if (!existsSync(dir(registry))) return [];
  const manifests = listManifests(registry);
  return readdirSync(dir(registry))
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((f) => {
      const r = StackSchema.safeParse(parseYaml(readFileSync(join(dir(registry), f), "utf8")));
      return r.success ? [r.data] : [];
    })
    .map((s) => ({
      ...s,
      usedBy: manifests.filter((m) => m.stackRef === s.name).map((m) => m.name),
      issues: checkStack(s.technologies.map((t) => t.id)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readStack(registry: string, name: string): Stack | null {
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(name) || !existsSync(file(registry, name))) return null;
  const r = StackSchema.safeParse(parseYaml(readFileSync(file(registry, name), "utf8")));
  return r.success ? r.data : null;
}

/** Writes stacks/<name>.yaml. A conflict in it is reported, not refused: the team decides. */
export function saveStack(registry: string, input: unknown, opts: { replace?: boolean } = {}): { stack: Stack; issues: StackIssue[] } {
  const raw = (input ?? {}) as Partial<Stack>;
  const r = StackSchema.safeParse({
    name: String(raw.name ?? "").trim(),
    description: raw.description?.trim() || undefined,
    // one entry per technology, the first one picked
    technologies: (Array.isArray(raw.technologies) ? raw.technologies : [])
      .filter((t) => t && typeof t === "object")
      .map((t) => ({ id: String(t.id ?? "").trim(), version: t.version == null ? undefined : String(t.version).trim() || undefined }))
      .filter((t, i, all) => all.findIndex((o) => o.id === t.id) === i),
  });
  if (!r.success) throw new StackError(r.error.issues.map((i) => `${i.path.map(String).join(".") || "stack"}: ${i.message}`).join("; "), 400);
  if (existsSync(file(registry, r.data.name)) && !opts.replace) throw new StackError(`stack ${r.data.name} already exists`, 409);
  mkdirSync(dir(registry), { recursive: true });
  writeFileSync(file(registry, r.data.name), stringifyYaml(r.data));
  return { stack: r.data, issues: checkStack(r.data.technologies.map((t) => t.id)) };
}

/** Deletes a stack, unless a service is still built on it. */
export function removeStack(registry: string, name: string): void {
  if (!readStack(registry, name)) throw new StackError(`no stack ${name}`, 404);
  const users = listManifests(registry).filter((m) => m.stackRef === name);
  if (users.length) throw new StackError(`${users.map((u) => u.name).join(", ")} ${users.length > 1 ? "are" : "is"} built on ${name}; change ${users.length > 1 ? "their" : "its"} stack first`, 409);
  unlinkSync(file(registry, name));
}
