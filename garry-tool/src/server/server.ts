import { createServer, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildPlan, listFeatures } from "../orchestrate/plan.js";
import { loadSkills } from "../orchestrate/skillsManifest.js";
import { describe } from "../orchestrate/delegate.js";
import { loadWorkspace } from "../workspace/workspace.js";
import { listManifests, readContracts } from "../sync/registryIO.js";

export interface ServerConfig {
  registry: string;
  skills: string;
  routing: string;
  root?: string;
}

const CORS = { "access-control-allow-origin": "*" } as const;

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(body, null, 2));
}

function worktrees(cfg: ServerConfig, id: string): Record<string, string> | undefined {
  if (!cfg.root) return undefined;
  const dir = resolve(cfg.root, id);
  if (!existsSync(join(dir, ".garry-workspace.json"))) return undefined;
  const state = loadWorkspace(dir);
  const map: Record<string, string> = {};
  for (const r of state.repos) map[r.service] = r.dir;
  return map;
}

function planFor(cfg: ServerConfig, id: string) {
  return buildPlan({
    registry: cfg.registry,
    skillsRoot: cfg.skills,
    routingFile: cfg.routing,
    featureId: id,
    worktrees: worktrees(cfg, id),
  });
}

function streamPlan(res: ServerResponse, cfg: ServerConfig, id: string): void {
  const plan = planFor(cfg, id); // may throw before headers are sent
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    ...CORS,
  });
  res.write(`event: feature\ndata: ${JSON.stringify({ id: plan.feature.id, title: plan.feature.title, order: plan.order })}\n\n`);

  let i = 0;
  const tick = () => {
    if (i >= plan.tasks.length) {
      res.write("event: done\ndata: {}\n\n");
      res.end();
      return;
    }
    const task = plan.tasks[i++];
    res.write(`event: task\ndata: ${JSON.stringify({ index: i, task, text: describe(task) })}\n\n`);
    setTimeout(tick, 60);
  };
  tick();
}

/** Builds the Garry HTTP server (REST plus SSE) over the supervisor. */
export function createGarryServer(cfg: ServerConfig): Server {
  return createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;

      if (path === "/" || path === "/health") {
        return json(res, 200, {
          ok: true,
          service: "garry-server",
          endpoints: [
            "GET /api/features",
            "GET /api/features/:id/plan",
            "GET /api/features/:id/stream (SSE)",
            "GET /api/skills",
            "GET /api/registry",
            "GET /api/routing",
          ],
        });
      }
      if (path === "/api/features") return json(res, 200, { features: listFeatures(cfg.registry) });
      if (path === "/api/skills") return json(res, 200, { skills: loadSkills(cfg.skills) });
      if (path === "/api/registry") {
        return json(res, 200, { services: listManifests(cfg.registry), contracts: readContracts(cfg.registry) });
      }
      if (path === "/api/routing") {
        const data = existsSync(cfg.routing)
          ? JSON.parse(readFileSync(cfg.routing, "utf8"))
          : { defaults: null, stages: {} };
        return json(res, 200, data);
      }

      const plan = /^\/api\/features\/([^/]+)\/plan$/.exec(path);
      if (plan) return json(res, 200, planFor(cfg, decodeURIComponent(plan[1])));

      const stream = /^\/api\/features\/([^/]+)\/stream$/.exec(path);
      if (stream) return streamPlan(res, cfg, decodeURIComponent(stream[1]));

      json(res, 404, { error: "not found", path });
    } catch (e) {
      json(res, 500, { error: String((e as Error).message ?? e) });
    }
  });
}
