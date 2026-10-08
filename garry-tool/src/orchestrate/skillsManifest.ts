import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface SkillEntry {
  name: string;
  stage: string;
  summary: string;
  dependsOn: string[];
  inputs: string[];
  outputs: string[];
}

/** Loads the skills manifest from a @garry/skills repository root. */
export function loadSkills(skillsRoot: string): SkillEntry[] {
  const raw = JSON.parse(readFileSync(join(skillsRoot, "manifest.json"), "utf8")) as {
    skills: Partial<SkillEntry>[];
  };
  return raw.skills.map((s) => ({
    name: s.name ?? "",
    stage: s.stage ?? "",
    summary: s.summary ?? "",
    dependsOn: s.dependsOn ?? [],
    inputs: s.inputs ?? [],
    outputs: s.outputs ?? [],
  }));
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
