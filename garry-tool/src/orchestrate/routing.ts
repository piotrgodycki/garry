import { activeProfileName, defaultProfile, readProfile } from "./profiles.js";

export interface Route {
  agent: string;
  model: string;
}

export interface Routing {
  base: Route;
  stages: Record<string, Route>;
  override: Record<string, Route>;
}

const DEFAULT_ROUTE: Route = { agent: "garry-dev", model: "claude-sonnet-5-5" };

/**
 * The profile is the feature's `routing:`, else the registry's active one, else Garry's example. The
 * feature's frontmatter override applies on top.
 */
export function resolveRouting(
  routingFile: string | undefined,
  override: Record<string, Route> | undefined,
  opts: { registry?: string; profile?: string } = {},
): Routing {
  const name = opts.profile ?? (opts.registry ? activeProfileName(opts.registry) : "default");
  const profile = (opts.registry ? readProfile(opts.registry, name, routingFile) : null) ?? defaultProfile(routingFile);
  return { base: profile.defaults ?? DEFAULT_ROUTE, stages: profile.stages, override: override ?? {} };
}

/** Override wins, then the stage map, then the base. */
export function routeFor(r: Routing, stage: string): Route {
  return r.override[stage] ?? r.stages[stage] ?? r.base;
}
