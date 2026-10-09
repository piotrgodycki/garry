import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { detectStack, type StackDetection } from "./detect.js";
import { extractMf, type MfConfig } from "./extractMf.js";

export interface AdoptResult {
  service: string;
  stack: StackDetection;
  mf: MfConfig;
  manifest: Record<string, unknown>;
  remoteEntry: { name: string; entry: string; exposes: string[] } | null;
}

/** Derives the service name: the MF config name, else the directory name. */
function serviceName(root: string, mf: MfConfig): string {
  return mf.name ?? basename(root);
}

/**
 * Reverse engineers a registry entry from an existing repository.
 * Pure: it reads the repo and returns what it found, without writing anything.
 */
export function analyzeRepo(root: string): AdoptResult {
  const stack = detectStack(root);
  const mf = extractMf(root, stack.configFile);
  const service = serviceName(root, mf);

  const manifest: Record<string, unknown> = {
    name: service,
    repo: `git@github.com:ORG/${service}.git`,
    stack: `${stack.framework} + ${stack.bundler} + ${stack.federation}`,
    framework: stack.framework,
    bundler: stack.bundler,
    federation: stack.federation,
    owner: "team-unknown",
    exposes: mf.exposes,
    consumes: {},
    db: null,
  };

  const remoteEntry =
    mf.exposes.length > 0
      ? { name: service, entry: `https://cdn.example.com/${service}/mf-manifest.json`, exposes: mf.exposes }
      : null;

  return { service, stack, mf, manifest, remoteEntry };
}

/**
 * Writes the derived manifest into catalog/ and merges the remote into
 * contracts/remotes.json. Existing files are preserved and merged, not clobbered.
 */
export function writeAdoption(registry: string, result: AdoptResult): string[] {
  const written: string[] = [];

  const catalogDir = join(registry, "catalog");
  mkdirSync(catalogDir, { recursive: true });
  const manifestFile = join(catalogDir, `${result.service}.yaml`);
  writeFileSync(manifestFile, stringifyYaml(result.manifest));
  written.push(`catalog/${result.service}.yaml`);

  if (result.remoteEntry) {
    const contractsDir = join(registry, "contracts");
    mkdirSync(contractsDir, { recursive: true });
    const remotesFile = join(contractsDir, "remotes.json");
    const remotes: Record<string, unknown> = existsSync(remotesFile)
      ? JSON.parse(readFileSync(remotesFile, "utf8"))
      : {};
    remotes[result.remoteEntry.name] = {
      entry: result.remoteEntry.entry,
      exposes: result.remoteEntry.exposes,
    };
    writeFileSync(remotesFile, JSON.stringify(remotes, null, 2) + "\n");
    written.push("contracts/remotes.json");
  }

  return written;
}

/** Reads the existing manifest name set, to warn about re-adopting. */
export function existingServices(registry: string): Set<string> {
  const dir = join(registry, "catalog");
  if (!existsSync(dir)) return new Set();
  const names = new Set<string>();
  for (const f of readdirSync(dir)) {
    if (!/\.ya?ml$/.test(f)) continue;
    const fm = parseYaml(readFileSync(join(dir, f), "utf8")) as { name?: string };
    if (fm?.name) names.add(fm.name);
  }
  return names;
}
