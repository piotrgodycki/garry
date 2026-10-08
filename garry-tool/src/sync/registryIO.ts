import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export interface Manifest {
  name: string;
  exposes: string[];
  consumes: Record<string, string[]>;
  [k: string]: unknown;
}

export interface Remote {
  entry: string;
  exposes: string[];
}

export interface EventDef {
  payload: Record<string, string>;
  producers: string[];
  consumers: string[];
}

export interface Contracts {
  remotes?: Record<string, Remote>;
  sharedDeps?: Record<string, unknown>;
  designTokens?: Record<string, unknown>;
  events?: Record<string, EventDef>;
}

/** Reads one service manifest from the registry catalog. */
export function readManifest(registry: string, service: string): Manifest {
  const file = join(registry, "catalog", `${service}.yaml`);
  if (!existsSync(file)) throw new Error(`service manifest not found: ${file}`);
  const raw = (parseYaml(readFileSync(file, "utf8")) ?? {}) as Partial<Manifest>;
  return { name: service, exposes: [], consumes: {}, ...raw } as Manifest;
}

function readJson<T>(p: string): T | undefined {
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

/** Reads the full set of contracts from the registry. Missing files are left undefined. */
export function readContracts(registry: string): Contracts {
  const dir = join(registry, "contracts");
  return {
    remotes: readJson(join(dir, "remotes.json")),
    sharedDeps: readJson(join(dir, "shared-deps.json")),
    designTokens: readJson(join(dir, "design-tokens.json")),
    events: readJson(join(dir, "events.json")),
  };
}
