import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { createGarryProject, garryProject, GarryProjectError, listGarryProjects, type GarryProject, type PendingRepo } from "./store.js";

/**
 * A Garry project in one file (.garry.json): its registry (services, contracts,
 * features, stacks, routing, the architecture board) and the repositories it
 * works on, as remotes to clone. Never tokens, never the code itself. Import
 * makes a new project from it; nothing outside the registry folders is ever
 * written, whatever the file says.
 */

export const BUNDLE_FORMAT = "garry-project";
export const BUNDLE_VERSION = 1;

export interface GarryBundle {
  format: typeof BUNDLE_FORMAT;
  version: number;
  name: string;
  description?: string;
  exportedAt: string;
  /** registry files by path, as text */
  files: Record<string, string>;
  repos: PendingRepo[];
}

const MAX_FILE = 1024 * 1024;
const MAX_TOTAL = 10 * 1024 * 1024;
const MAX_FILES = 2000;

/** Only what a registry holds, and nothing that climbs out of it. */
export function bundlePathOk(path: string): boolean {
  if (path === "architecture.json") return true;
  if (!/^(catalog|contracts|features|stacks|routing|adr)\/[A-Za-z0-9._/-]+$/.test(path)) return false;
  return path.split("/").every((seg) => seg !== "" && seg !== "." && seg !== ".." && !seg.startsWith("."));
}

/** A remote without credentials in it (https://user:token@host/... loses the user part). */
export function cleanRemote(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.protocol === "http:") {
      u.username = "";
      u.password = "";
      return u.toString().replace(/\/$/, "");
    }
  } catch {
    /* scp-like git@host:owner/name */
  }
  return url;
}

function walk(root: string, dir = root, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(root, full, out);
    else if (st.isFile()) out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

export function exportGarryProject(id: string, repos: PendingRepo[]): GarryBundle {
  const p = garryProject(id);
  if (!p) throw new GarryProjectError(`no project ${id}`, 404);
  const files: Record<string, string> = {};
  let total = 0;
  for (const rel of walk(p.path).filter(bundlePathOk).sort()) {
    const data = readFileSync(join(p.path, rel));
    if (data.length > MAX_FILE) continue;
    total += data.length;
    if (total > MAX_TOTAL) throw new GarryProjectError("the project is too large to export in one file", 413);
    files[rel] = data.toString("utf8");
  }
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    exportedAt: new Date().toISOString(),
    files,
    repos: [...repos, ...(p.pendingRepos ?? [])].map((r) => ({ ...r, remote: cleanRemote(r.remote) })),
  };
}

/** Makes a new project from a bundle. Its name gets " (2)" and so on when it is taken. */
export function importGarryProject(input: unknown): GarryProject {
  const b = input as Partial<GarryBundle> | null;
  if (!b || typeof b !== "object" || b.format !== BUNDLE_FORMAT) throw new GarryProjectError("not a Garry project file", 400);
  if (typeof b.version !== "number" || b.version > BUNDLE_VERSION) throw new GarryProjectError("made by a newer Garry; update Garry first", 400);
  const files = b.files && typeof b.files === "object" ? Object.entries(b.files) : [];
  if (files.length > MAX_FILES) throw new GarryProjectError("too many files", 413);
  let total = 0;
  for (const [path, content] of files) {
    if (!bundlePathOk(path)) throw new GarryProjectError(`refused: ${path} is not a registry file`, 400);
    if (typeof content !== "string") throw new GarryProjectError(`${path}: not text`, 400);
    total += Buffer.byteLength(content);
    if (Buffer.byteLength(content) > MAX_FILE || total > MAX_TOTAL) throw new GarryProjectError("the file is too large", 413);
  }
  const repos = (Array.isArray(b.repos) ? b.repos : [])
    .filter((r): r is PendingRepo => !!r && typeof r.name === "string" && typeof r.remote === "string")
    .slice(0, 100)
    .map((r) => ({ name: r.name.slice(0, 64), remote: cleanRemote(r.remote), ...(r.settings && typeof r.settings === "object" ? { settings: r.settings } : {}) }));

  const taken = new Set(listGarryProjects().projects.map((p) => p.name));
  const base = String(b.name ?? "Imported project").trim().slice(0, 70) || "Imported project";
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} (${n})`;
  const p = createGarryProject({ name, description: b.description }, repos.length ? { pendingRepos: repos } : {});
  for (const [path, content] of files) {
    const target = join(p.path, ...path.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return p;
}

/** A repository's origin as configured, without credentials; empty when it has none. */
export function originOf(repo: string): string {
  try {
    return cleanRemote(execFileSync("git", ["-C", repo, "config", "--get", "remote.origin.url"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch {
    return "";
  }
}
