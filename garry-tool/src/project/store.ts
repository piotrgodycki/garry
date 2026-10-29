import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { garryHome } from "../server/auth.js";
import type { ProjectSettings } from "../threads/settings.js";

/**
 * Garry projects: everything one product is made of, kept together and
 * switched as one. A project is a registry folder (services, contracts,
 * features, stacks, routing, the architecture board) plus the repositories
 * agents work on in it, each with its push settings. The list lives in
 * ~/.garry/garry-projects.json; each project's registry in
 * ~/.garry/garry-projects/<id>/, except "default", which is the registry Garry
 * always used (~/.garry/registry). Any project can be removed, the default and
 * the active one too, as long as one is left.
 */

export interface PendingRepo {
  name: string;
  /** where to clone it from (credentials never included) */
  remote: string;
  settings?: Partial<ProjectSettings>;
}

export interface GarryProject {
  id: string;
  name: string;
  description?: string;
  /** the project's registry folder */
  path: string;
  createdAt: string;
  /** repositories an imported project names but that are not cloned here yet */
  pendingRepos?: PendingRepo[];
}

export class GarryProjectError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const listFile = () => join(garryHome(), "garry-projects.json");
const legacyRegistry = () => join(garryHome(), "registry");

type Index = { active: string; projects: GarryProject[] };

const ensureRegistry = (path: string) => {
  for (const dir of ["catalog", "contracts", "features"]) mkdirSync(join(path, dir), { recursive: true });
};

function read(): Index {
  try {
    const j = JSON.parse(readFileSync(listFile(), "utf8")) as Index;
    if (Array.isArray(j.projects) && j.projects.length > 0) return j.projects.some((p) => p.id === j.active) ? j : { ...j, active: j.projects[0].id };
  } catch {
    /* first run */
  }
  // the registry Garry always used becomes the default project, saved on first use
  const first: Index = { active: "default", projects: [{ id: "default", name: "Default", path: legacyRegistry(), createdAt: new Date().toISOString() }] };
  write(first);
  return first;
}

function write(index: Index): void {
  mkdirSync(garryHome(), { recursive: true });
  const tmp = `${listFile()}.tmp`;
  writeFileSync(tmp, JSON.stringify(index, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, listFile());
}

export function listGarryProjects(): Index {
  return read();
}

export function activeGarryProject(): GarryProject {
  const index = read();
  const p = index.projects.find((x) => x.id === index.active) ?? index.projects[0];
  ensureRegistry(p.path);
  return p;
}

export function garryProject(id: string): GarryProject | undefined {
  return read().projects.find((p) => p.id === id);
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "project";

export function createGarryProject(input: { name?: unknown; description?: unknown }, extra: Partial<GarryProject> = {}): GarryProject {
  const name = String(input.name ?? "").trim();
  if (!name || name.length > 80) throw new GarryProjectError("name: 1 to 80 characters", 400);
  const description = input.description === undefined ? undefined : String(input.description).trim().slice(0, 300) || undefined;
  const index = read();
  let id = slugify(name);
  if (index.projects.some((p) => p.id === id)) id = `${id}-${randomBytes(3).toString("hex")}`;
  const path = join(garryHome(), "garry-projects", id);
  ensureRegistry(path);
  const p: GarryProject = { id, name, ...(description ? { description } : {}), path, createdAt: new Date().toISOString(), ...extra };
  write({ ...index, projects: [...index.projects, p] });
  return p;
}

export function useGarryProject(id: string): GarryProject {
  const index = read();
  const p = index.projects.find((x) => x.id === id);
  if (!p) throw new GarryProjectError(`no project ${id}`, 404);
  ensureRegistry(p.path);
  write({ ...index, active: id });
  return p;
}

export function updateGarryProject(id: string, patch: { name?: unknown; description?: unknown; pendingRepos?: PendingRepo[] }): GarryProject {
  const index = read();
  const p = index.projects.find((x) => x.id === id);
  if (!p) throw new GarryProjectError(`no project ${id}`, 404);
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name || name.length > 80) throw new GarryProjectError("name: 1 to 80 characters", 400);
    p.name = name;
  }
  if (patch.description !== undefined) p.description = String(patch.description).trim().slice(0, 300) || undefined;
  if (patch.pendingRepos !== undefined) p.pendingRepos = patch.pendingRepos.length ? patch.pendingRepos : undefined;
  write(index);
  return p;
}

/**
 * Removes a project and its registry folder (services, contracts, features,
 * stacks, routing, the architecture boards). The last project stays; removing
 * the active one makes another active, the default first. Returns the project
 * active afterwards. The repositories are not touched here.
 */
export function removeGarryProject(id: string): GarryProject {
  const index = read();
  const p = index.projects.find((x) => x.id === id);
  if (!p) throw new GarryProjectError(`no project ${id}`, 404);
  const rest = index.projects.filter((x) => x.id !== id);
  if (!rest.length) throw new GarryProjectError("the last project stays: make another one first", 400);
  const active = index.active === id ? (rest.find((x) => x.id === "default") ?? rest[0]).id : index.active;
  // only folders Garry made: its own one, or the registry it always used
  const folder = resolve(p.path);
  if ((folder === resolve(join(garryHome(), "garry-projects", id)) || (id === "default" && folder === resolve(legacyRegistry()))) && existsSync(folder)) rmSync(folder, { recursive: true, force: true });
  write({ active, projects: rest });
  return rest.find((x) => x.id === active)!;
}
