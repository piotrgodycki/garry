// Builds the publishable garry package: one ESM bundle in dist/ (the registry and
// skills code is inlined, npm dependencies stay external), plus the pre-installed
// skills and the sample registry copied next to it (see src/paths.ts).
import { build } from "esbuild";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(pkg, "..");

for (const dir of ["dist", "skills", "examples", "LICENSE"]) rmSync(join(pkg, dir), { recursive: true, force: true });

await build({
  entryPoints: [join(pkg, "src/cli.ts")],
  outfile: join(pkg, "dist/cli.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  logLevel: "warning",
});

const copy = (from, to) => {
  if (!existsSync(from)) throw new Error(`missing ${from}`);
  cpSync(from, join(pkg, to), { recursive: true });
};
copy(join(repo, "LICENSE"), "LICENSE");
copy(join(repo, "garry-skills/manifest.json"), "skills/manifest.json");
copy(join(repo, "garry-skills/skills"), "skills/skills");
copy(join(repo, "garry-registry/examples/registry-sample"), "examples/registry-sample");
console.log("bundled dist/cli.js, skills/, examples/ and LICENSE");
