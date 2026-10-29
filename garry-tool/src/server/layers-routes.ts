import type { IncomingMessage, ServerResponse } from "node:http";
import { activeGarryProject, garryProject } from "../project/store.js";
import { listManifests } from "../sync/registryIO.js";
import { LayerError, layerAt, parseScope, readLayers, saveLayer } from "../registry/layers.js";
import { agentContext, servicesIn } from "../registry/agent-context.js";
import type { ThreadManager } from "../threads/manager.js";
import { json, readBody, type RouteCtx } from "./http.js";

/** The registry a repository's Garry project keeps, the active one read from the server's config. */
export function registryOf(cfg: RouteCtx["cfg"], garry: string | undefined): { path: string; name: string } {
  const id = garry ?? "default";
  const active = activeGarryProject();
  if (id === active.id) return { path: cfg.registry, name: active.name };
  const p = garryProject(id);
  return p ? { path: p.path, name: p.name } : { path: cfg.registry, name: active.name };
}

/** Gives every agent turn what its repository's layers add up to. */
export function wireAgentContext(cfg: RouteCtx["cfg"], threads: ThreadManager): void {
  threads.context ??= (projectId) => {
    const repo = threads.store.project(projectId);
    if (!repo) return null;
    const reg = registryOf(cfg, repo.garryProject);
    return agentContext({ registry: reg.path, skillsRoot: cfg.skills, project: reg.name, repo });
  };
}

/**
 * Layers of the active Garry project: read them all, save one (the project's,
 * a repository's or a service's), and see what an agent in one repository gets.
 */
export async function layerRoutes(req: IncomingMessage, res: ServerResponse, path: string, ctx: RouteCtx): Promise<boolean | void> {
  const { cfg, url } = ctx;
  if (!path.startsWith("/api/layers")) return false;
  const repos = cfg.threads?.store.projectsOf(activeGarryProject().id) ?? [];
  if (req.method === "GET" && path === "/api/layers") {
    // each service with the repository here it lives in, if any
    const home = new Map<string, string>();
    for (const r of repos) for (const s of servicesIn(cfg.registry, r)) if (!home.has(s.name)) home.set(s.name, r.name);
    const services = listManifests(cfg.registry).map((m) => ({ name: m.name, repo: String(m.repo ?? ""), inRepo: home.get(m.name) ?? null, stackRef: typeof m.stackRef === "string" ? m.stackRef : null }));
    return json(res, 200, { layers: readLayers(cfg.registry), repos: repos.map((r) => ({ id: r.id, name: r.name })), services });
  }
  if (req.method === "POST" && path === "/api/layers") {
    const body = (await readBody(req)) as { scope?: unknown; layer?: unknown };
    try {
      const scope = parseScope(body.scope);
      const layers = saveLayer(cfg.registry, scope, body.layer);
      return json(res, 200, { layers, layer: layerAt(layers, scope) });
    } catch (e) {
      if (e instanceof LayerError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }
  if (req.method === "GET" && path === "/api/layers/agent") {
    const repo = repos.find((r) => r.id === url.searchParams.get("repo"));
    if (!repo) return json(res, 404, { error: "no such repository in this project" });
    const reg = registryOf(cfg, repo.garryProject);
    return json(res, 200, agentContext({ registry: reg.path, skillsRoot: cfg.skills, project: reg.name, repo }));
  }
  return false;
}
