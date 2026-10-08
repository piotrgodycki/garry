import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { git, gitTry } from "./git.js";

export interface FeatureInfo {
  id: string;
  services: string[];
  branch: string;
}

export interface WorkspaceRepo {
  service: string;
  dir: string;
}

export interface WorkspaceState {
  id: string;
  branch: string;
  registry: string;
  repos: WorkspaceRepo[];
}

export interface WsPaths {
  cache: string;
  root: string;
}

function frontmatter(src: string): Record<string, unknown> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  return m ? ((parseYaml(m[1]) ?? {}) as Record<string, unknown>) : {};
}

/** Finds a feature by id and returns its services and the shared branch name. */
export function findFeature(registry: string, id: string): FeatureInfo {
  const dir = join(registry, "features");
  if (!existsSync(dir)) throw new Error(`no features/ directory in registry: ${registry}`);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    const fm = frontmatter(readFileSync(join(dir, f), "utf8"));
    if (fm.id === id) {
      return { id, services: (fm.services as string[]) ?? [], branch: `feat/${id}` };
    }
  }
  throw new Error(`feature ${id} not found in ${dir}`);
}

/** Reads the repo url for a service from its catalog manifest. */
export function repoUrl(registry: string, service: string): string {
  const file = join(registry, "catalog", `${service}.yaml`);
  if (!existsSync(file)) throw new Error(`manifest not found: ${file}`);
  const fm = (parseYaml(readFileSync(file, "utf8")) ?? {}) as { repo?: string };
  if (!fm.repo) throw new Error(`no repo url in manifest for ${service}`);
  return fm.repo;
}

/**
 * Materializes a feature on disk: for each service, keeps a mirror clone in the
 * cache and adds a git worktree on the shared branch feat/<id>. The team's own
 * checkouts are never touched.
 */
export function createWorkspace(registry: string, id: string, paths: WsPaths): WorkspaceState {
  const feature = findFeature(registry, id);
  const wsDir = resolve(paths.root, id);
  mkdirSync(wsDir, { recursive: true });
  const cacheDir = resolve(paths.cache);
  mkdirSync(cacheDir, { recursive: true });

  const repos: WorkspaceRepo[] = [];
  for (const svc of feature.services) {
    const url = repoUrl(registry, svc);
    const mirror = join(cacheDir, `${svc}.git`);
    if (!existsSync(mirror)) git(["clone", "--mirror", url, mirror]);
    else gitTry(["-C", mirror, "fetch", "--all", "--prune"]);

    const defaultBranch = git(["-C", mirror, "symbolic-ref", "--short", "HEAD"]);
    if (!gitTry(["-C", mirror, "rev-parse", "--verify", "--quiet", feature.branch]).ok) {
      git(["-C", mirror, "branch", feature.branch, defaultBranch]);
    }

    const wt = join(wsDir, svc);
    if (!existsSync(wt)) git(["-C", mirror, "worktree", "add", wt, feature.branch]);
    repos.push({ service: svc, dir: wt });
  }

  const state: WorkspaceState = { id, branch: feature.branch, registry: resolve(registry), repos };
  writeFileSync(join(wsDir, ".garry-workspace.json"), JSON.stringify(state, null, 2) + "\n");
  return state;
}

/** Loads the workspace state from a workspace directory. */
export function loadWorkspace(wsDir: string): WorkspaceState {
  const file = join(resolve(wsDir), ".garry-workspace.json");
  if (!existsSync(file)) throw new Error(`not a workspace (no .garry-workspace.json): ${wsDir}`);
  return JSON.parse(readFileSync(file, "utf8")) as WorkspaceState;
}

/** Returns the current branch and the number of dirty entries for a repo. */
export function repoStatus(dir: string): { branch: string; dirty: number } {
  const branch = gitTry(["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"]).out;
  const st = gitTry(["-C", dir, "status", "--porcelain"]).out;
  const dirty = st ? st.split("\n").filter(Boolean).length : 0;
  return { branch, dirty };
}
