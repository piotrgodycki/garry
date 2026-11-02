import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { activeGarryProject } from "./project/store.js";

/**
 * Default locations for skills, the registry and the dashboard when no flag names
 * them. The registry is always the user's own: Garry ships no sample services.
 */

/** The package root: garry-tool/ when run from source, the installed package when bundled. */
export const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

export function defaultSkillsRoot(): string {
  return join(PACKAGE_ROOT, "skills");
}

/**
 * ./registry when it holds a catalog, else the active Garry project's registry,
 * created empty on first use.
 */
export function defaultRegistry(): string {
  if (existsSync(join("registry", "catalog"))) return "registry";
  return activeGarryProject().path;
}

/** The built dashboard: garry-ui/dist in the monorepo (after pnpm -C garry-ui build), else the one shipped with garry. */
export function defaultUiDir(): string | undefined {
  for (const dir of ["garry-ui/dist", join(PACKAGE_ROOT, "ui")]) if (existsSync(join(dir, "index.html"))) return dir;
  return undefined;
}
