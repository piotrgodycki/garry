// Packs garry the way npm publishes it, installs the tarball into an empty project
// and runs the CLI from a folder with no monorepo around it. The release job only
// publishes a package that passes this.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(tmpdir(), "garry-smoke-"));
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts });

run("npm", ["pack", "--pack-destination", work], { cwd: pkg });
const tarball = readdirSync(work).find((f) => f.endsWith(".tgz"));
if (!tarball) throw new Error("npm pack produced no tarball");

const project = join(work, "project");
run("mkdir", ["-p", project]);
run("npm", ["init", "-y"], { cwd: project });
run("npm", ["install", "--no-audit", "--no-fund", join(work, tarball)], { cwd: project });

const env = { ...process.env, GARRY_HOME: join(work, "home"), GARRY_SKILLS_HOME: join(work, "home", "skills") };
const garry = (...args) => run(join(project, "node_modules", ".bin", "garry"), args, { cwd: project, env });

const checks = [
  [["--help"], "garry <command>"],
  [["skills", "list"], "pre-installed"],
  [["skills", "audit"], "pass"],
  [["feature", "FEAT-123"], "search-mfe"],
];
for (const [args, expect] of checks) {
  const out = garry(...args);
  if (!out.includes(expect)) throw new Error(`garry ${args.join(" ")}: expected "${expect}" in:\n${out}`);
  console.log(`ok  garry ${args.join(" ")}`);
}
console.log(`smoke test passed (${tarball})`);
