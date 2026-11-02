import type { Contracts, EventDef, Manifest, Remote } from "./registryIO.js";

/**
 * Remotes and events are narrowed to what this service consumes or produces. Shared dependencies and design
 * tokens stay whole because singletons and tokens are global by nature.
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
