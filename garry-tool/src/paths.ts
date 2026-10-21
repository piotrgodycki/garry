import { cpSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where garry finds its skills and its registry when no flag names them.
 *
 * Inside the Garry monorepo the CLI uses the folders of the repository. Installed
 * from npm it uses the user's own folders and falls back to the copies bundled in
 * the package (scripts/bundle.mjs puts them next to dist/).
 */

/** The package root: garry-tool/ when run from source, the installed package when bundled. */
export const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

const REPO_SKILLS = "garry-skills";
const REPO_REGISTRY = "garry-registry/examples/registry-sample";

/** The pre-installed skills: ./garry-skills in the monorepo, else the ones shipped with garry. */
export function defaultSkillsRoot(): string {
  if (existsSync(join(REPO_SKILLS, "manifest.json"))) return REPO_SKILLS;
  const bundled = join(PACKAGE_ROOT, "skills");
  return existsSync(join(bundled, "manifest.json")) ? bundled : REPO_SKILLS;
}

/**
 * The registry: the monorepo sample, else ./registry when it holds a catalog,
 * else a writable copy of the bundled sample in ~/.garry/sample-registry so a
 * first run works anywhere (and never writes into the installed package).
 */
export function defaultRegistry(): string {
  if (existsSync(REPO_REGISTRY)) return REPO_REGISTRY;
  if (existsSync(join("registry", "catalog"))) return "registry";
  const bundled = join(PACKAGE_ROOT, "examples", "registry-sample");
  if (!existsSync(bundled)) return REPO_REGISTRY;
  const copy = join(process.env.GARRY_HOME ?? join(homedir(), ".garry"), "sample-registry");
  if (!existsSync(copy)) cpSync(bundled, copy, { recursive: true });
  console.error(`garry: no ./registry found, using the sample registry in ${copy} (pass --registry to use yours)`);
  return copy;
}
