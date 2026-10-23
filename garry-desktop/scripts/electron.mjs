// Runs the app with the Electron binary, downloading it on first use (pnpm does
// not run the electron package's install script, so CI never pays for it).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dir = dirname(require.resolve("electron/package.json"));
if (!existsSync(join(dir, "path.txt"))) execFileSync(process.execPath, [join(dir, "install.js")], { stdio: "inherit" });
const electron = require("electron");
process.exit(spawnSync(electron, process.argv.slice(2), { stdio: "inherit" }).status ?? 1);
