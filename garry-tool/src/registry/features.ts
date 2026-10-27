import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { STAGES } from "../orchestrate/plan.js";
import { listManifests } from "../sync/registryIO.js";

/**
 * Creates features in the registry and removes them: one markdown document each
 * in features/FEAT-<n>-<slug>.md, the format garry feature, the dashboard and the
 * agents read. Used by garry feature new, the dashboard and the phone.
 */

export class FeatureError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface FeatureInput {
  title?: string;
  /** what it should do and why, in plain words; becomes the Goal section */
  goal?: string;
  /** the services it touches; may be empty while it is still a spec */
  services?: string[];
  /** the contract files it changes, e.g. events.json */
  contractChanges?: string[];
}

export const CONTRACT_FILES = ["events.json", "remotes.json", "shared-deps.json", "design-tokens.json", "api.json"];

const ID = /^FEAT-(\d+)$/;
const list = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))] : []);

function documents(registry: string): { file: string; id: string }[] {
  const dir = join(registry, "features");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .flatMap((f) => {
      const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(dir, f), "utf8"));
      const id = m ? String(((parseYaml(m[1]) ?? {}) as { id?: unknown }).id ?? "") : "";
      return id ? [{ file: join(dir, f), id }] : [];
    });
}

const slug = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");

/** Writes a new feature at the first stage (spec) with the next free FEAT-<n> id. */
export function createFeature(registry: string, input: FeatureInput): { id: string; title: string; status: string; services: string[]; file: string } {
  const title = (input.title ?? "").trim().replace(/\s+/g, " ");
  if (!title) throw new FeatureError("title: say in a few words what the feature is", 400);
  if (title.length > 120) throw new FeatureError("title: 120 characters at most", 400);

  const services = list(input.services);
  const known = new Set(listManifests(registry).map((m) => m.name));
  const unknown = services.filter((s) => !known.has(s));
  if (unknown.length) throw new FeatureError(`services: not in the registry: ${unknown.join(", ")}`, 400);
  const contractChanges = list(input.contractChanges);
  const badContract = contractChanges.filter((c) => !CONTRACT_FILES.includes(c));
  if (badContract.length) throw new FeatureError(`contractChanges: one of ${CONTRACT_FILES.join(", ")}`, 400);

  const docs = documents(registry);
  const next = Math.max(0, ...docs.map((d) => Number(ID.exec(d.id)?.[1] ?? 0))) + 1;
  const id = `FEAT-${next}`;
  const front = stringifyYaml({ id, title, status: STAGES[0], services, contractChanges }).trimEnd();
  const goal = (input.goal ?? "").trim() || title;
  const body = [
    `---\n${front}\n---`,
    `## Goal\n\n${goal}`,
    `## Stage state\n\n${STAGES.map((s) => `- [ ] ${s}`).join("\n")}`,
  ].join("\n\n");

  const dir = join(registry, "features");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${[id, slug(title)].filter(Boolean).join("-")}.md`);
  writeFileSync(file, body + "\n", { flag: "wx" });
  return { id, title, status: STAGES[0], services, file };
}

/** Deletes a feature's document. */
export function removeFeature(registry: string, id: string): void {
  const doc = documents(registry).find((d) => d.id === id);
  if (!doc) throw new FeatureError(`no feature ${id}`, 404);
  unlinkSync(doc.file);
}
