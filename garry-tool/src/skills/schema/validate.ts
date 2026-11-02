import { readFileSync, existsSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import { parse as parseYaml } from "yaml";
import { SkillsManifestSchema, SkillFrontmatterSchema } from "./schema.js";

export interface ValidationIssue {
  level: "error" | "warn";
  where: string;
  message: string;
}

/**
 * Deliberately not gray-matter: it can execute a javascript frontmatter block, and SKILL.md is untrusted.
 * Nothing is evaluated here; the fenced block is only parsed as YAML.
 */
function extractYamlFrontmatter(src: string): string | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(src);
  return m ? m[1] : null;
}

/** A missing SKILL.md is only a warning: the skill is planned, not built yet. */
export function validateSkills(root: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) => issues.push({ level: "warn", where, message });

  const manifestPath = join(root, "manifest.json");
  if (!existsSync(manifestPath)) {
    err("manifest.json", "manifest.json is missing");
    return issues;
  }

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    err("manifest.json", `invalid JSON: ${(e as Error).message}`);
    return issues;
  }

  const parsed = SkillsManifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    err("manifest.json", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return issues;
  }

  const manifest = parsed.data;
  const names = new Set<string>();

  for (const skill of manifest.skills) {
    if (names.has(skill.name)) err("manifest.json", `duplicate skill name: ${skill.name}`);
    names.add(skill.name);
  }

  for (const skill of manifest.skills) {
    for (const dep of skill.dependsOn) {
      if (!manifest.skills.some((s) => s.name === dep)) err(`skill:${skill.name}`, `dependsOn references an unknown skill: ${dep}`);
    }

    // skill.path comes from the untrusted manifest, so the resolved path must stay inside the repository.
    const rootResolved = resolve(root);
    const skillDir = resolve(rootResolved, skill.path);
    const rel = relative(rootResolved, skillDir);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      err(`skill:${skill.name}`, `path escapes the skills repository: ${skill.path}`);
      continue;
    }

    const skillMd = join(skillDir, "SKILL.md");
    if (!existsSync(skillMd)) {
      warn(`skill:${skill.name}`, `SKILL.md is missing (planned, not built yet): ${skill.path}`);
      continue;
    }

    const yamlBlock = extractYamlFrontmatter(readFileSync(skillMd, "utf8"));
    if (yamlBlock === null) {
      err(`skill:${skill.name}`, "SKILL.md has no YAML frontmatter at the top");
      continue;
    }
    let fm: unknown;
    try {
      fm = parseYaml(yamlBlock) ?? {};
    } catch (e) {
      err(`skill:${skill.name}`, `invalid YAML frontmatter: ${(e as Error).message}`);
      continue;
    }
    const r = SkillFrontmatterSchema.safeParse(fm);
    if (!r.success) {
      err(`skill:${skill.name}`, `invalid frontmatter: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      continue;
    }
    if (r.data.name !== skill.name) warn(`skill:${skill.name}`, `frontmatter name (${r.data.name}) does not match the manifest name`);
  }

  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}
