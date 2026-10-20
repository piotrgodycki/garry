import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Locally installed skills: skills a user adds on their machine on top of the
 * pre-installed ones that ship with the project. Each one lives in its own folder,
 * <dir>/<name>/SKILL.md, plus a garry.json sidecar with the SDLC stage, so the
 * user's SKILL.md is stored exactly as given.
 *
 * SKILL.md is untrusted input: its frontmatter is parsed as YAML only (never with
 * an engine that can run code), names are restricted to a safe charset so they
 * cannot escape the folder, and copies skip symlinks and stay within size limits.
 */

export const STAGES = ["spec", "plan", "design", "implement", "review", "test", "integrate"] as const;
export type Stage = (typeof STAGES)[number];

const NAME = /^[a-z0-9][a-z0-9-]{1,63}$/;
const MAX_SKILL_MD = 200_000;
const MAX_FILES = 50;
const MAX_TOTAL = 2_000_000;

export class SkillError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface ParsedSkill {
  name: string;
  description: string;
  stage?: Stage;
  dependsOn: string[];
}

export interface LocalSkill extends ParsedSkill {
  stage: Stage;
  installedAt: string;
  from: string;
}

/** Where local skills live: GARRY_SKILLS_HOME, else ~/.garry/skills. */
export function localSkillsDir(): string {
  return resolve(process.env.GARRY_SKILLS_HOME?.trim() || join(homedir(), ".garry", "skills"));
}

const isStage = (s: unknown): s is Stage => typeof s === "string" && (STAGES as readonly string[]).includes(s);

/** Reads name, description, stage and dependsOn from the YAML frontmatter of a SKILL.md. */
export function parseSkillMd(src: string): ParsedSkill {
  if (src.length > MAX_SKILL_MD) throw new SkillError(`SKILL.md is larger than ${MAX_SKILL_MD / 1000} kB`);
  const m = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(src);
  if (!m) throw new SkillError("SKILL.md must start with a YAML frontmatter block (--- name, description ---)");
  let fm: Record<string, unknown>;
  try {
    fm = (parseYaml(m[1]) ?? {}) as Record<string, unknown>;
  } catch (e) {
    throw new SkillError(`the frontmatter is not valid YAML: ${(e as Error).message.split("\n")[0]}`);
  }
  const name = typeof fm.name === "string" ? fm.name.trim() : "";
  const description = typeof fm.description === "string" ? fm.description.trim() : "";
  if (!NAME.test(name)) throw new SkillError("name must be 2 to 64 characters: lowercase letters, digits and dashes");
  if (!description) throw new SkillError("description is required in the frontmatter");
  if (fm.stage !== undefined && !isStage(fm.stage)) throw new SkillError(`stage must be one of: ${STAGES.join(", ")}`);
  const dependsOn = Array.isArray(fm.dependsOn) ? fm.dependsOn.filter((d): d is string => typeof d === "string") : [];
  return { name, description: description.slice(0, 1024), stage: fm.stage as Stage | undefined, dependsOn };
}

/** Every locally installed skill. A broken folder is skipped, not fatal. */
export function listLocalSkills(dir = localSkillsDir()): LocalSkill[] {
  if (!existsSync(dir)) return [];
  const out: LocalSkill[] = [];
  for (const name of readdirSync(dir)) {
    if (!NAME.test(name)) continue;
    const md = join(dir, name, "SKILL.md");
    if (!existsSync(md)) continue;
    try {
      const parsed = parseSkillMd(readFileSync(md, "utf8"));
      const side = readSidecar(join(dir, name));
      const stage = side.stage ?? parsed.stage;
      if (!stage) continue;
      out.push({ ...parsed, name, stage, installedAt: side.installedAt ?? "", from: side.from ?? "" });
    } catch {
      // an unreadable skill is left out of the pipeline
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function readSidecar(folder: string): { stage?: Stage; installedAt?: string; from?: string } {
  const f = join(folder, "garry.json");
  if (!existsSync(f)) return {};
  try {
    const raw = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
    return {
      stage: isStage(raw.stage) ? raw.stage : undefined,
      installedAt: typeof raw.installedAt === "string" ? raw.installedAt : undefined,
      from: typeof raw.from === "string" ? raw.from : undefined,
    };
  } catch {
    return {};
  }
}

export interface InstallRequest {
  /** SKILL.md text, for an upload */
  content?: string;
  /** a folder holding SKILL.md, or the SKILL.md file itself, on this machine */
  path?: string;
  /** the SDLC stage, when the frontmatter does not say */
  stage?: string;
  /** overwrite a local skill with the same name */
  replace?: boolean;
  /** validate and preview only, write nothing */
  dryRun?: boolean;
}

export interface InstallResult {
  skill: ParsedSkill & { stage: Stage };
  files: string[];
  installed: boolean;
}

/**
 * Installs a skill from uploaded SKILL.md text or from a folder on this machine.
 * Pre-installed names are reserved, so a local skill can never silently replace
 * one that ships with the project.
 */
export function installSkill(req: InstallRequest, reserved: Set<string>, dir = localSkillsDir()): InstallResult {
  let source: string;
  let files: { rel: string; abs?: string }[] = [];
  let text: string;
  if (typeof req.content === "string" && req.content.trim()) {
    text = req.content;
    source = "upload";
    files = [{ rel: "SKILL.md" }];
  } else if (typeof req.path === "string" && req.path.trim()) {
    const p = resolve(req.path.trim().replace(/^~(?=$|\/)/, homedir()));
    if (!existsSync(p)) throw new SkillError(`nothing at ${p}`);
    const folder = statSync(p).isDirectory() ? p : dirname(p);
    if (!statSync(p).isDirectory() && basename(p) !== "SKILL.md") throw new SkillError("point at a folder or at its SKILL.md");
    const md = join(folder, "SKILL.md");
    if (!existsSync(md)) throw new SkillError(`no SKILL.md in ${folder}`);
    text = readFileSync(md, "utf8");
    source = folder;
    files = collectFiles(folder);
  } else {
    throw new SkillError("send the SKILL.md content or a path");
  }

  const parsed = parseSkillMd(text);
  const stage = isStage(req.stage) ? req.stage : parsed.stage;
  if (!stage) throw new SkillError(`pick a stage (${STAGES.join(", ")}): the SKILL.md frontmatter does not set one`);
  if (reserved.has(parsed.name)) throw new SkillError(`"${parsed.name}" is a pre-installed skill; rename yours`, 409);
  const target = join(dir, parsed.name);
  if (existsSync(target) && !req.replace) throw new SkillError(`"${parsed.name}" is already installed locally`, 409);

  const result: InstallResult = { skill: { ...parsed, stage }, files: files.map((f) => f.rel), installed: false };
  if (req.dryRun) return result;

  mkdirSync(dir, { recursive: true });
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  if (source === "upload") writeFileSync(join(target, "SKILL.md"), text);
  else for (const f of files) {
    mkdirSync(dirname(join(target, f.rel)), { recursive: true });
    cpSync(f.abs!, join(target, f.rel));
  }
  writeFileSync(join(target, "garry.json"), JSON.stringify({ stage, installedAt: new Date().toISOString(), from: source }, null, 2) + "\n");
  return { ...result, installed: true };
}

/** Regular files of a skill folder, without symlinks, dot folders or node_modules, within limits. */
function collectFiles(folder: string): { rel: string; abs: string }[] {
  const out: { rel: string; abs: string }[] = [];
  let total = 0;
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry.startsWith(".") || entry === "node_modules" || entry === "garry.json") continue;
      const abs = join(d, entry);
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(abs);
      else if (st.isFile()) {
        total += st.size;
        out.push({ rel: relative(folder, abs), abs });
        if (out.length > MAX_FILES) throw new SkillError(`a skill folder can hold at most ${MAX_FILES} files`);
        if (total > MAX_TOTAL) throw new SkillError(`a skill folder can hold at most ${MAX_TOTAL / 1_000_000} MB`);
      }
    }
  };
  walk(folder);
  return out;
}

/** Removes a local skill. Only names in the safe charset, only inside the local folder. */
export function removeSkill(name: string, dir = localSkillsDir()): void {
  if (!NAME.test(name)) throw new SkillError("invalid skill name");
  const target = join(dir, name);
  if (!existsSync(join(target, "SKILL.md"))) throw new SkillError(`"${name}" is not installed locally`, 404);
  rmSync(target, { recursive: true, force: true });
}

/** The SKILL.md text of a local skill, for a preview. */
export function readLocalSkillMd(name: string, dir = localSkillsDir()): string | null {
  if (!NAME.test(name)) return null;
  const md = join(dir, name, "SKILL.md");
  return existsSync(md) ? readFileSync(md, "utf8") : null;
}
