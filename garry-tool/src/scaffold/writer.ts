import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { type ScaffoldOptions, stackString } from "./options.js";
import type { GeneratedFile } from "./templates.js";

/** Writes the generated files under the given root. */
export function writeFiles(root: string, files: GeneratedFile[]): void {
  for (const f of files) {
    const full = join(root, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content);
  }
}

/** Writes the service manifest into the registry catalog and returns its path. */
export function writeCatalogEntry(opts: ScaffoldOptions): string {
  const isHost = opts.kind === "shell";
  const manifest = {
    name: opts.name,
    repo: `git@github.com:ORG/${opts.name}.git`,
    stack: stackString(opts),
    framework: opts.framework,
    bundler: opts.bundler,
    federation: opts.federation,
    owner: opts.owner,
    exposes: isHost ? [] : ["./App"],
    consumes: {},
    db: null,
  };
  const dir = join(opts.registry, "catalog");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${opts.name}.yaml`);
  writeFileSync(file, stringifyYaml(manifest));
  return file;
}
