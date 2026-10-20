import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listLocalSkills, localSkillsDir } from "../skills/local.js";

export interface SkillEntry {
  name: string;
  stage: string;
  summary: string;
  dependsOn: string[];
  inputs: string[];
  outputs: string[];
  /** builtin ships with the project (pre-installed); local was added on this machine */
  source: "builtin" | "local";
  /** whether the instructions (SKILL.md) exist; a builtin without them is planned */
  hasDoc: boolean;
}

/** The skills that ship with a @garry/skills repository (the pre-installed ones). */
export function loadBuiltinSkills(skillsRoot: string): SkillEntry[] {
  const raw = JSON.parse(readFileSync(join(skillsRoot, "manifest.json"), "utf8")) as {
    skills: (Partial<SkillEntry> & { path?: string })[];
  };
  return raw.skills.map((s) => ({
    name: s.name ?? "",
    stage: s.stage ?? "",
    summary: s.summary ?? "",
    dependsOn: s.dependsOn ?? [],
    inputs: s.inputs ?? [],
    outputs: s.outputs ?? [],
    source: "builtin" as const,
    hasDoc: Boolean(s.path && existsSync(join(skillsRoot, s.path, "SKILL.md"))),
  }));
}

/**
 * All skills the pipeline can use: the pre-installed ones plus those installed
 * locally (see skills/local.ts). A local skill joins its stage like any other.
 */
export function loadSkills(skillsRoot: string, localDir = localSkillsDir()): SkillEntry[] {
  const builtin = loadBuiltinSkills(skillsRoot);
  const taken = new Set(builtin.map((s) => s.name));
  const local = listLocalSkills(localDir)
    .filter((s) => !taken.has(s.name))
    .map((s) => ({
      name: s.name,
      stage: s.stage,
      summary: s.description,
      dependsOn: s.dependsOn,
      inputs: [],
      outputs: [],
      source: "local" as const,
      hasDoc: true,
    }));
  return [...builtin, ...local];
}

/** Returns the skills of one stage, ordered by their dependsOn within that stage. */
export function skillsForStage(all: SkillEntry[], stage: string): SkillEntry[] {
  const subset = all.filter((s) => s.stage === stage);
  const inSub = new Set(subset.map((s) => s.name));
  const byName = new Map(all.map((s) => [s.name, s] as const));
  const result: SkillEntry[] = [];
  const seen = new Set<string>();
  const visit = (s: SkillEntry) => {
    if (seen.has(s.name)) return;
    seen.add(s.name);
    for (const dep of s.dependsOn) {
      if (inSub.has(dep)) visit(byName.get(dep)!);
    }
    result.push(s);
  };
  for (const s of subset) visit(s);
  return result;
}
