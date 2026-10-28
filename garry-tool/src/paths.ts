import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where garry finds its skills and its registry when no flag names them.
 *
 * Skills: the ones shipped with garry (skills/ in the package, which is
 * garry-tool/skills in the monorepo). The registry is always the user's own:
 * Garry ships no sample services or features.
 */

/** The package root: garry-tool/ when run from source, the installed package when bundled. */
export const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The pre-installed skills, shipped with garry. */
export function defaultSkillsRoot(): string {
  return join(PACKAGE_ROOT, "skills");
}

/**
 * The registry: ./registry when it holds a catalog, else ~/.garry/registry,
 * created empty on first use. Services and features are added from there on
 * (garry service add, the dashboard).
 */
export function defaultRegistry(): string {
  if (existsSync(join("registry", "catalog"))) return "registry";
  const home = join(process.env.GARRY_HOME ?? join(homedir(), ".garry"), "registry");
  for (const dir of ["catalog", "contracts", "features"]) mkdirSync(join(home, dir), { recursive: true });
  return home;
}

/** The built dashboard: garry-ui/dist in the monorepo (after pnpm -C garry-ui build), else the one shipped with garry. */
export function defaultUiDir(): string | undefined {
  for (const dir of ["garry-ui/dist", join(PACKAGE_ROOT, "ui")]) if (existsSync(join(dir, "index.html"))) return dir;
  return undefined;
}
