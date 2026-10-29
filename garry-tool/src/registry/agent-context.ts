import { basename, resolve } from "node:path";
import { listManifests } from "../sync/registryIO.js";
import { loadSkills, usableSkills, type SkillEntry } from "../orchestrate/skillsManifest.js";
import { readArchitecture } from "./architecture.js";
import { listStacks } from "./stacks.js";
import { readLayers, resolveLayers, type From, type Resolved } from "./layers.js";
import { memoryPrompt } from "../garry/memory.js";

/** Everything an agent in one repository is given, and where each piece comes from. */
export interface AgentContext extends Resolved {
  repo: string;
  services: string[];
  /** skills a layer names that are not installed, or that failed their audit */
  missing: string[];
  /** appended to the agent's system prompt */
  prompt: string;
  /** skill folders the agent may read */
  dirs: string[];
}

const MAX_PROMPT = 12_000;
const repoName = (r: string) => basename(r.replace(/\/+$/, "")).replace(/\.git$/, "").toLowerCase();
const where = (f: From) => (f === "everywhere" ? "every project" : f === "project" ? "the project" : f.startsWith("repo:") ? "this repository" : `service ${f.slice(8)}`);

/** The services of the registry that live in a repository (named after it, or at its path). */
export function servicesIn(registry: string, repo: { name: string; path: string }) {
  return listManifests(registry).filter((m) => {
    const r = String(m.repo ?? "").trim();
    return r && (repoName(r) === repo.name.toLowerCase() || resolve(r) === resolve(repo.path));
  });
}

export function agentContext(opts: { registry: string; skillsRoot: string; project?: string; repo: { name: string; path: string } }): AgentContext {
  const { registry, repo } = opts;
  const services = servicesIn(registry, repo);
  // skills that cannot be read leave the rest (stacks, architecture, notes, memory) in place
  const all = (() => {
    try {
      return usableSkills(loadSkills(opts.skillsRoot));
    } catch {
      return [];
    }
  })();
  const byName = new Map<string, SkillEntry>(all.map((s) => [s.name, s]));
  const resolved = resolveLayers(readLayers(registry), {
    repo: repo.name,
    services: services.map((s) => ({ name: s.name, stackRef: typeof s.stackRef === "string" ? s.stackRef : undefined })),
    everywhere: all.filter((s) => s.everywhere).map((s) => s.name),
  });
  const skills = resolved.skills.filter((s) => byName.get(s.name)?.hasDoc);
  const missing = resolved.skills.filter((s) => !byName.get(s.name)?.hasDoc).map((s) => s.name);
  const stacks = new Map(listStacks(registry).map((s) => [s.name, s]));

  const lines: string[] = [`You work in the repository ${repo.name}${opts.project ? ` of the Garry project ${opts.project}` : ""}.`];
  if (services.length) lines.push(`Services in it: ${services.map((s) => `${s.name}${s.kind ? ` (${s.kind})` : ""}`).join(", ")}.`);
  if (resolved.stacks.length) {
    lines.push("", "Stacks the code is built with (keep to them; ask before adding a technology):");
    for (const s of resolved.stacks) {
      const st = stacks.get(s.name);
      const tech = st ? st.technologies.map((t) => `${t.id}${t.version ? `@${t.version}` : ""}`).join(", ") : "not defined in Garry";
      lines.push(`- ${s.name} (${where(s.from)}): ${tech}${st?.description ? `. ${st.description}` : ""}`);
    }
  }
  for (const board of resolved.boards) {
    const a = readArchitecture(registry, board);
    if (!a.nodes.length) continue;
    const label = new Map(a.nodes.map((n) => [n.id, n.label || n.block]));
    lines.push("", `Architecture, ${board ? "this repository" : "the whole project"}: ${a.nodes.map((n) => label.get(n.id)).join(", ")}.`);
    if (a.edges.length) lines.push(`Connections: ${a.edges.map((e) => `${label.get(e.from) ?? e.from} needs ${label.get(e.to) ?? e.to}`).join("; ")}.`);
  }
  if (skills.length) {
    lines.push("", "Skills you have. When a task matches one, read its SKILL.md first and follow it:");
    for (const s of skills) lines.push(`- ${s.name}: ${byName.get(s.name)!.summary} (${byName.get(s.name)!.dir}/SKILL.md; from ${where(s.from)})`);
  }
  for (const n of resolved.notes) lines.push("", `Notes from the team for ${where(n.from)}:`, n.text);
  const memory = memoryPrompt(registry);
  if (memory) lines.push("", memory);
  const prompt = lines.join("\n").slice(0, MAX_PROMPT);
  const dirs = skills.map((s) => byName.get(s.name)!.dir).filter((d): d is string => Boolean(d));
  return { ...resolved, skills, repo: repo.name, services: services.map((s) => s.name), missing, prompt, dirs };
}
