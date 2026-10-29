import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * Layers: what agents are given, set once for the whole Garry project and
 * changed per repository and per service. A layer turns skills on (or off
 * again, for what a wider layer turned on), names the stacks the code is built
 * with and holds the team's own notes. An agent in a repository gets the sum:
 * the project's layer, then the repository's, then each service in it. The
 * architecture follows the same order with the boards that already exist: the
 * whole project's board, then the repository's. Kept in <registry>/layers.json.
 */

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export const LayerSchema = z.object({
  skills: z.array(z.string().max(64)).max(200).default([]),
  /** skills a wider layer turned on that this one leaves out */
  skillsOff: z.array(z.string().max(64)).max(200).default([]),
  stacks: z.array(z.string().max(64)).max(20).default([]),
  notes: z.string().max(4000).default(""),
});
export type Layer = z.infer<typeof LayerSchema>;

export const LayersSchema = z.object({
  project: LayerSchema.default({ skills: [], skillsOff: [], stacks: [], notes: "" }),
  repos: z.record(z.string(), LayerSchema).default({}),
  services: z.record(z.string(), LayerSchema).default({}),
});
export type Layers = z.infer<typeof LayersSchema>;

export type Scope = { level: "project" } | { level: "repo" | "service"; name: string };

export class LayerError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const file = (registry: string) => join(registry, "layers.json");
const empty = (): Layer => LayerSchema.parse({});

export function readLayers(registry: string): Layers {
  try {
    if (existsSync(file(registry))) return LayersSchema.parse(JSON.parse(readFileSync(file(registry), "utf8")));
  } catch {
    // a broken file reads as no layers; saving one writes a good one again
  }
  return LayersSchema.parse({});
}

export function parseScope(raw: unknown): Scope {
  const s = (raw ?? {}) as { level?: unknown; name?: unknown };
  if (s.level === "project") return { level: "project" };
  if ((s.level === "repo" || s.level === "service") && typeof s.name === "string" && NAME.test(s.name)) return { level: s.level, name: s.name };
  throw new LayerError('scope must be { level: "project" } or { level: "repo" | "service", name }');
}

export function layerAt(layers: Layers, scope: Scope): Layer {
  if (scope.level === "project") return layers.project;
  return (scope.level === "repo" ? layers.repos : layers.services)[scope.name] ?? empty();
}

/** Replaces one layer; an empty repository or service layer is dropped from the file. */
export function saveLayer(registry: string, scope: Scope, input: unknown): Layers {
  const r = LayerSchema.safeParse(input);
  if (!r.success) throw new LayerError(r.error.issues.map((i) => `${i.path.map(String).join(".") || "layer"}: ${i.message}`).join("; "));
  const tidy = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  const layer: Layer = { skills: tidy(r.data.skills), skillsOff: tidy(r.data.skillsOff), stacks: tidy(r.data.stacks), notes: r.data.notes.trim() };
  const layers = readLayers(registry);
  if (scope.level === "project") layers.project = layer;
  else {
    const map = scope.level === "repo" ? layers.repos : layers.services;
    const blank = !layer.skills.length && !layer.skillsOff.length && !layer.stacks.length && !layer.notes;
    if (blank) delete map[scope.name];
    else map[scope.name] = layer;
  }
  mkdirSync(registry, { recursive: true });
  const tmp = `${file(registry)}.tmp`;
  writeFileSync(tmp, JSON.stringify(layers, null, 2) + "\n");
  renameSync(tmp, file(registry));
  return layers;
}

/** Turns one skill on in a layer (a per-project install lands here). */
export function addSkillTo(registry: string, scope: Scope, skill: string): void {
  const l = layerAt(readLayers(registry), scope);
  saveLayer(registry, scope, { ...l, skills: [...l.skills, skill], skillsOff: l.skillsOff.filter((s) => s !== skill) });
}

/** Where a piece of what an agent gets comes from. */
export type From = "everywhere" | "project" | `repo:${string}` | `service:${string}`;

export interface Resolved {
  skills: { name: string; from: From }[];
  stacks: { name: string; from: From }[];
  notes: { from: From; text: string }[];
  /** the boards, widest first: "" is the whole project's */
  boards: string[];
}

/**
 * What an agent in one repository gets: skills installed for every project,
 * then the project's layer, the repository's, and each of its services'. A
 * narrower layer adds skills and can turn off one a wider layer turned on.
 * Stacks: the repository's replace the project's when it names any; each
 * service adds the stack it is built with and its own.
 */
export function resolveLayers(layers: Layers, input: { repo: string; services: { name: string; stackRef?: string }[]; everywhere: string[] }): Resolved {
  const repoLayer = layers.repos[input.repo] ?? empty();
  const skills = new Map<string, From>();
  const turnOn = (names: string[], from: From) => names.forEach((n) => skills.has(n) || skills.set(n, from));
  const turnOff = (names: string[]) => names.forEach((n) => skills.delete(n));
  turnOn(input.everywhere, "everywhere");
  turnOn(layers.project.skills, "project");
  turnOff(layers.project.skillsOff);
  turnOn(repoLayer.skills, `repo:${input.repo}`);
  turnOff(repoLayer.skillsOff);

  const stacks = new Map<string, From>();
  const repoStacks = repoLayer.stacks.length ? repoLayer.stacks : layers.project.stacks;
  repoStacks.forEach((s) => stacks.set(s, repoLayer.stacks.length ? `repo:${input.repo}` : "project"));
  const notes: Resolved["notes"] = [];
  if (layers.project.notes) notes.push({ from: "project", text: layers.project.notes });
  if (repoLayer.notes) notes.push({ from: `repo:${input.repo}`, text: repoLayer.notes });

  for (const svc of input.services) {
    const l = layers.services[svc.name] ?? empty();
    const from: From = `service:${svc.name}`;
    turnOn(l.skills, from);
    // one agent works on the whole repository: a service can only leave a skill out when it is the only one there
    if (input.services.length === 1) turnOff(l.skillsOff);
    for (const s of [svc.stackRef, ...l.stacks]) if (s && !stacks.has(s)) stacks.set(s, from);
    if (l.notes) notes.push({ from, text: l.notes });
  }
  return {
    skills: [...skills].map(([name, from]) => ({ name, from })),
    stacks: [...stacks].map(([name, from]) => ({ name, from })),
    notes,
    boards: ["", ...(NAME.test(input.repo) ? [input.repo] : [])],
  };
}
