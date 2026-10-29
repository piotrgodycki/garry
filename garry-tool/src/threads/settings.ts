/**
 * What Garry may do with a project's git remote, set per project. By default
 * Garry asks before every push, never pushes to a protected branch (main,
 * master, develop, release/*), names its branches garry/<work>-<id>, and opens
 * pull requests against the repository's default branch. Agents never push at
 * all: only a person, from Garry, after this check.
 */

export type PushMode = "ask" | "allow" | "never";

export interface ProjectSettings {
  /** ask: show what will be pushed and wait for a yes; allow: push when asked to open a PR; never: no pushes from Garry */
  push: PushMode;
  /** the branch pull requests target; empty is the repository's default branch */
  baseBranch: string;
  /** what Garry's branches start with */
  branchPrefix: string;
  /** branches Garry never pushes to; * matches anything */
  protectedBranches: string[];
  /** open pull requests as drafts */
  draftPr: boolean;
  /** a commit with a file over this many tokens (bytes / 4) is refused, so agents can read files whole; 0 turns it off */
  maxFileTokens: number;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  push: "ask",
  baseBranch: "",
  branchPrefix: "garry/",
  protectedBranches: ["main", "master", "develop", "release/*"],
  draftPr: false,
  maxFileTokens: 5000,
};

export class SettingsError extends Error {
  readonly status = 400;
}

/** A name git accepts for a branch (a subset of git check-ref-format). */
const branchOk = (s: string) => /^[A-Za-z0-9._/-]+$/.test(s) && !/(^[/.-])|\/\/|\.\.|@\{|\.lock$|\/$|\.$/.test(s) && s.length <= 100;

export function settingsOf(stored: Partial<ProjectSettings> | undefined): ProjectSettings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}), protectedBranches: [...(stored?.protectedBranches ?? DEFAULT_SETTINGS.protectedBranches)] };
}

/** Checks a change to the settings and returns the new whole. */
export function applySettings(current: ProjectSettings, input: unknown): ProjectSettings {
  if (!input || typeof input !== "object") throw new SettingsError("settings: an object");
  const i = input as Record<string, unknown>;
  const next = { ...current, protectedBranches: [...current.protectedBranches] };
  if (i.push !== undefined) {
    if (!["ask", "allow", "never"].includes(String(i.push))) throw new SettingsError("push: ask, allow or never");
    next.push = i.push as PushMode;
  }
  if (i.baseBranch !== undefined) {
    const b = String(i.baseBranch).trim();
    if (b && !branchOk(b)) throw new SettingsError(`baseBranch: ${b} is not a branch name`);
    next.baseBranch = b;
  }
  if (i.branchPrefix !== undefined) {
    const p = String(i.branchPrefix).trim();
    // the prefix plus a name must still be a branch name
    if (p.length > 40 || !branchOk(`${p}x`)) throw new SettingsError("branchPrefix: letters, digits, . _ - and /, up to 40");
    next.branchPrefix = p;
  }
  if (i.protectedBranches !== undefined) {
    const list = Array.isArray(i.protectedBranches) ? i.protectedBranches : String(i.protectedBranches).split(",");
    const clean = [...new Set(list.map((x) => String(x).trim()).filter(Boolean))];
    if (clean.length > 30 || clean.some((x) => !/^[A-Za-z0-9._/*-]{1,100}$/.test(x))) throw new SettingsError("protectedBranches: branch names or patterns with *, up to 30");
    next.protectedBranches = clean;
  }
  if (i.draftPr !== undefined) next.draftPr = i.draftPr === true || i.draftPr === "true";
  if (i.maxFileTokens !== undefined) {
    const n = Number(i.maxFileTokens);
    if (!Number.isInteger(n) || (n !== 0 && (n < 500 || n > 100_000))) throw new SettingsError("maxFileTokens: 0 (off) or 500 to 100000");
    next.maxFileTokens = n;
  }
  if (isProtected(`${next.branchPrefix}work`, next.protectedBranches)) throw new SettingsError("branchPrefix: Garry's branches would be protected and could never be pushed");
  return next;
}

export function isProtected(branch: string, patterns: string[]): boolean {
  return patterns.some((p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(branch));
}

/** Why a push of this branch is refused, or null when it may go ahead. */
export function pushRefusal(s: ProjectSettings, branch: string, base: string): string | null {
  if (s.push === "never") return "pushing is turned off for this project (Build, project settings)";
  if (branch === base) return `${branch} is the branch pull requests go into; Garry pushes only its own branches`;
  if (isProtected(branch, s.protectedBranches)) return `${branch} is protected in this project's settings`;
  return null;
}
