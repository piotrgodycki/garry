// Builds the desktop app: the main process as one ESM bundle (garry serve and its
// dependencies inlined, so the app needs no node_modules), plus the dashboard,
// the pre-installed skills and the sample registry next to it, the same layout
// as the garry npm package (see garry-tool/src/paths.ts).
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(pkg, "..");

for (const dir of ["dist", "ui", "skills", "examples", "LICENSE"]) rmSync(join(pkg, dir), { recursive: true, force: true });

await build({
  entryPoints: [join(pkg, "src/main.ts")],
  outfile: join(pkg, "dist/main.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // electron is provided by the runtime; playwright is only for garry shots
  external: ["electron", "playwright"],
  // bundled CommonJS dependencies call require
  banner: { js: "import { createRequire as __garryRequire } from 'node:module'; const require = __garryRequire(import.meta.url);" },
  logLevel: "warning",
});

// the preload runs in the sandboxed page, which loads CommonJS only
await build({
  entryPoints: [join(pkg, "src/preload.ts")],
  outfile: join(pkg, "dist/preload.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  logLevel: "warning",
});

const copy = (from, to) => {
  if (!existsSync(from)) throw new Error(`missing ${from}`);
  cpSync(from, join(pkg, to), { recursive: true });
};
execFileSync("pnpm", ["-C", join(repo, "garry-ui"), "build"], { stdio: "inherit" });
copy(join(repo, "garry-ui/dist"), "ui");
copy(join(repo, "LICENSE"), "LICENSE");
copy(join(repo, "garry-skills/manifest.json"), "skills/manifest.json");
copy(join(repo, "garry-skills/skills"), "skills/skills");
copy(join(repo, "garry-registry/examples/registry-sample"), "examples/registry-sample");
console.log("built dist/main.mjs, dist/preload.cjs, ui/, skills/, examples/ and LICENSE");
