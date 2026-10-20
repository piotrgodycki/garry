// Contract shapes as served by /api/registry, plus helpers the UI shares.

export interface EventContract {
  payload?: Record<string, string>;
  producers?: string[];
  consumers?: string[];
}

export interface RemoteContract {
  entry?: string;
  exposes?: string[];
}

export interface SharedDep {
  version?: string;
  requiredVersion?: string;
  singleton?: boolean;
}

export interface Contracts {
  events?: Record<string, EventContract> | null;
  remotes?: Record<string, RemoteContract> | null;
  sharedDeps?: Record<string, SharedDep> | null;
  designTokens?: Record<string, unknown> | null;
}

export interface RegistryService {
  name: string;
  stack?: string;
  owner?: string;
  exposes: string[];
  consumes: Record<string, string[]>;
}

export interface RegistryData {
  services: RegistryService[];
  contracts: Contracts;
}

/** Human names for the contract files a feature can change. */
export const CONTRACT_LABEL: Record<string, string> = {
  "events.json": "Events",
  "remotes.json": "Remote modules",
  "shared-deps.json": "Shared dependencies",
  "design-tokens.json": "Design tokens",
  "api.json": "API",
};

export const contractLabel = (file: string) => CONTRACT_LABEL[file] ?? file;

/** Events that involve at least one of the given services, as producer or consumer. */
export function eventsFor(contracts: Contracts, services: string[]): [string, EventContract][] {
  const set = new Set(services);
  return Object.entries(contracts.events ?? {}).filter(
    ([, e]) => (e.producers ?? []).some((s) => set.has(s)) || (e.consumers ?? []).some((s) => set.has(s)),
  );
}

/** Flattens nested design tokens into dotted names: color.brand.primary -> #0a0a0a. */
export function flattenTokens(obj: unknown, prefix = ""): [string, string][] {
  if (!obj || typeof obj !== "object") return [];
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const name = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...flattenTokens(v, name));
    else out.push([name, String(v)]);
  }
  return out;
}
