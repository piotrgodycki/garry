import { readFileSync, existsSync } from "node:fs";

export interface Route {
  agent: string;
  model: string;
}

export interface Routing {
  base: Route;
  stages: Record<string, Route>;
  override: Record<string, Route>;
}

const DEFAULT_ROUTE: Route = { agent: "garry-dev", model: "claude-sonnet-4-6" };

/**
 * Resolves the routing: defaults, then garry.routing.json stages, then the per
 * feature override. The override comes from the feature frontmatter.
 */
export function resolveRouting(routingFile: string | undefined, override: Record<string, Route> | undefined): Routing {
  let base = DEFAULT_ROUTE;
  let stages: Record<string, Route> = {};
  if (routingFile && existsSync(routingFile)) {
    const j = JSON.parse(readFileSync(routingFile, "utf8")) as { defaults?: Route; stages?: Record<string, Route> };
    if (j.defaults) base = j.defaults;
    stages = j.stages ?? {};
  }
  return { base, stages, override: override ?? {} };
}

/** Picks the agent and model for a stage: override wins, then the stage map, then the base. */
export function routeFor(r: Routing, stage: string): Route {
  return r.override[stage] ?? r.stages[stage] ?? r.base;
}
