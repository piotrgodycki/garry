import pc from "picocolors";
import { loadBuiltinSkills, loadSkills } from "../orchestrate/skillsManifest.js";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { SkillError, installSkill, listLocalSkills, localSkillsDir, removeSkill, STAGES } from "../skills/local.js";
import { auditFiles, readSkillFolder, type AuditReport } from "../skills/audit.js";

const HELP = `garry skills <list|add|remove> [options]

The skills the agents use: the pre-installed ones that ship with the project,
plus skills installed locally on this machine (${"~/.garry/skills"}, or
GARRY_SKILLS_HOME). A local skill joins its SDLC stage in every feature's plan.

  list                       every skill, pre-installed and local, with its audit
  add <folder|SKILL.md>      audit, then install a skill from this machine
      [--stage <stage>]      when the frontmatter has no stage: ${STAGES.join(", ")}
      [--replace]            overwrite a local skill with the same name
      [--accept-warnings]    install despite medium findings, after reading them
  remove <name>              remove a local skill
  audit [folder ...]         security audit; without folders, every installed
                             skill. Exits 1 when any skill fails (use it in CI)

Every skill is audited for prompt injection, hidden text, remote code execution,
destructive commands, secret exfiltration, persistence, safety bypasses,
obfuscation and supply chain risk. Critical or high findings block a skill;
medium findings are warnings a human has to accept.

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
          const audit = !s.audit
            ? pc.dim("not audited (no instructions yet)")
            : s.audit.verdict === "pass"
              ? pc.green("audit passed")
              : s.audit.verdict === "warn"
                ? pc.yellow(`${s.audit.counts.medium} warning(s)`)
                : pc.red(`BLOCKED by audit (${s.audit.counts.critical} critical, ${s.audit.counts.high} high)`);
          console.log(`  ${s.name.padEnd(28)} ${tag.padEnd(24)} ${audit}`);
        }
      }
      console.log(pc.dim(`\nlocal skills folder: ${localSkillsDir()}`));
      return;
    }
    if (sub === "add") {
      if (!target || target.startsWith("--")) throw new SkillError("garry skills add needs a folder or a SKILL.md path");
      const reserved = new Set(loadBuiltinSkills(skillsRoot).map((s) => s.name));
      try {
        const res = installSkill({ path: target, stage: opt("stage"), replace: has("replace"), acknowledge: has("accept-warnings") }, reserved);
        printAudit(res.skill.name, res.audit);
        console.log(`${pc.green("installed")} ${res.skill.name} (${res.skill.stage}), ${res.files.length} file(s)`);
      } catch (e) {
        if (e instanceof SkillError && e.audit) printAudit(target, e.audit);
        throw e;
      }
      return;
    }
    if (sub === "remove") {
      if (!target) throw new SkillError("garry skills remove needs a skill name");
      removeSkill(target);
      console.log(`${pc.green("removed")} ${target}`);
      return;
    }
    if (sub === "audit") {
      const folders = [target, ...rest].filter((a): a is string => Boolean(a) && !a.startsWith("--") && a !== opt("skills"));
      const reports: { name: string; audit: AuditReport }[] = [];
      if (folders.length) {
        for (const f of folders) {
          const folder = existsSync(f) && statSync(f).isFile() ? dirname(f) : f;
          if (!existsSync(join(folder, "SKILL.md"))) throw new SkillError(`no SKILL.md in ${folder}`);
          reports.push({ name: folder, audit: auditFiles(readSkillFolder(folder)) });
        }
      } else {
        for (const s of loadBuiltinSkills(skillsRoot)) {
          if (!s.hasDoc) continue;
          const raw = readFileSync(join(skillsRoot, "manifest.json"), "utf8");
          const path = (JSON.parse(raw) as { skills: { name: string; path: string }[] }).skills.find((x) => x.name === s.name)?.path;
          if (path) reports.push({ name: `${s.name} (pre-installed)`, audit: auditFiles(readSkillFolder(join(skillsRoot, path))) });
        }
        for (const s of listLocalSkills()) reports.push({ name: `${s.name} (local)`, audit: s.audit });
      }
      for (const r of reports) printAudit(r.name, r.audit);
      const failed = reports.filter((r) => r.audit.verdict === "fail").length;
      const warned = reports.filter((r) => r.audit.verdict === "warn").length;
      console.log(`\n${reports.length} skill(s) audited: ${reports.length - failed - warned} passed, ${warned} with warnings, ${failed} failed`);
      if (failed) process.exitCode = 1;
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

function printAudit(name: string, audit: AuditReport): void {
  const head =
    audit.verdict === "pass" ? pc.green("PASS") : audit.verdict === "warn" ? pc.yellow("WARN") : pc.red("FAIL");
  console.log(`${head} ${name}`);
  for (const f of audit.findings) {
    const sev = f.severity === "critical" || f.severity === "high" ? pc.red(f.severity) : pc.yellow(f.severity);
    console.log(`  ${sev} ${f.title} [${f.rule}] ${pc.dim(`${f.file}:${f.line}`)}`);
    console.log(pc.dim(`    ${f.excerpt}`));
  }
}
