import pc from "picocolors";
import { loadBuiltinSkills, loadSkills } from "../orchestrate/skillsManifest.js";
import { SkillError, installSkill, localSkillsDir, removeSkill, STAGES } from "../skills/local.js";

const HELP = `garry skills <list|add|remove> [options]

The skills the agents use: the pre-installed ones that ship with the project,
plus skills installed locally on this machine (${"~/.garry/skills"}, or
GARRY_SKILLS_HOME). A local skill joins its SDLC stage in every feature's plan.

  list                       every skill, pre-installed and local
  add <folder|SKILL.md>      install a skill from this machine
      [--stage <stage>]      when the frontmatter has no stage: ${STAGES.join(", ")}
      [--replace]            overwrite a local skill with the same name
  remove <name>              remove a local skill

Options:
  --skills <path>  skills repo root (default: garry-skills)
`;

export async function runSkills(argv: string[]): Promise<void> {
  const [sub, target, ...rest] = argv;
  const opt = (k: string) => {
    const i = [target, ...rest].indexOf(`--${k}`);
    return i >= 0 ? [target, ...rest][i + 1] : undefined;
  };
  const has = (k: string) => [target, ...rest].includes(`--${k}`);
  const skillsRoot = opt("skills") ?? "garry-skills";

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(HELP);
    return;
  }
  try {
    if (sub === "list") {
      const all = loadSkills(skillsRoot);
      for (const stage of STAGES) {
        const items = all.filter((s) => s.stage === stage);
        if (!items.length) continue;
        console.log(pc.bold(stage));
        for (const s of items) {
          const tag = s.source === "local" ? pc.red("local") : s.hasDoc ? pc.dim("pre-installed") : pc.dim("pre-installed, planned");
          console.log(`  ${s.name.padEnd(28)} ${tag}`);
        }
      }
      console.log(pc.dim(`\nlocal skills folder: ${localSkillsDir()}`));
      return;
    }
    if (sub === "add") {
      if (!target || target.startsWith("--")) throw new SkillError("garry skills add needs a folder or a SKILL.md path");
      const reserved = new Set(loadBuiltinSkills(skillsRoot).map((s) => s.name));
      const res = installSkill({ path: target, stage: opt("stage"), replace: has("replace") }, reserved);
      console.log(`${pc.green("installed")} ${res.skill.name} (${res.skill.stage}), ${res.files.length} file(s)`);
      return;
    }
    if (sub === "remove") {
      if (!target) throw new SkillError("garry skills remove needs a skill name");
      removeSkill(target);
      console.log(`${pc.green("removed")} ${target}`);
      return;
    }
    console.error(`Unknown skills command: ${sub}`);
    process.exitCode = 1;
  } catch (e) {
    if (e instanceof SkillError) {
      console.error(pc.red(e.message));
      process.exitCode = 1;
      return;
    }
    throw e;
  }
}
