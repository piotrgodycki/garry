// Builds the publishable garry package: one ESM bundle in dist/ (npm
// dependencies stay external) and the built dashboard copied next to it. The
// pre-installed skills already live in skills/ (see src/paths.ts).
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(pkg, "..");

for (const dir of ["dist", "ui", "LICENSE"]) rmSync(join(pkg, dir), { recursive: true, force: true });

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
execFileSync("pnpm", ["-C", join(repo, "garry-ui"), "build"], { stdio: "inherit" });
copy(join(repo, "garry-ui/dist"), "ui");
copy(join(repo, "LICENSE"), "LICENSE");
console.log("bundled dist/cli.js, ui/ and LICENSE");
