import type { Contracts, EventDef, Manifest, Remote } from "./registryIO.js";

/**
 * Computes the slice of contracts a single service may rely on.
 * - remotes: only the services this one consumes.
 * - shared dependencies and design tokens: the full contract, because shared
 *   singletons and tokens are global by nature.
 * - events: only those where this service is a producer or a consumer.
 */
export function computeSlice(manifest: Manifest, contracts: Contracts): Contracts {
  const consumed = Object.keys(manifest.consumes ?? {});

  let remotes: Record<string, Remote> | undefined;
  if (contracts.remotes) {
    remotes = {};
    for (const svc of consumed) {
      const r = contracts.remotes[svc];
      if (r) remotes[svc] = r;
    }
  }

  let events: Record<string, EventDef> | undefined;
  if (contracts.events) {
    events = {};
    for (const [name, ev] of Object.entries(contracts.events)) {
      if (ev.producers.includes(manifest.name) || ev.consumers.includes(manifest.name)) {
        events[name] = ev;
      }
    }
  }

  return {
    remotes,
    sharedDeps: contracts.sharedDeps,
    designTokens: contracts.designTokens,
    events,
  };
}
