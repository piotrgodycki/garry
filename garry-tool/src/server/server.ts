import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildPlan, listFeatures, loadFeature } from "../orchestrate/plan.js";
import { loadSkills } from "../orchestrate/skillsManifest.js";
import { describe } from "../orchestrate/delegate.js";
import { MODELS, isKnownModel } from "../orchestrate/models.js";
import { loadWorkspace } from "../workspace/workspace.js";
import { listManifests, readContracts } from "../sync/registryIO.js";

export interface ServerConfig {
  registry: string;
  skills: string;
  routing: string;
  root?: string;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
} as const;

// In memory per service model overrides, keyed by feature id. Resets on restart.
const serviceModels = new Map<string, Record<string, string>>();

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(body, null, 2));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e as Error);
      }
    });
    req.on("error", reject);
  });
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
    serviceModels: serviceModels.get(id),
  });
}

/** Derived PR view per service. Real GitHub data lands in phase 6 (narrow token). */
function prsFor(cfg: ServerConfig, id: string) {
  const feature = loadFeature(cfg.registry, id);
  const manifests = new Map(listManifests(cfg.registry).map((m) => [m.name, m]));
  return feature.services.map((svc) => {
    const repo = (manifests.get(svc)?.repo as string) ?? "";
    const slug = repo.replace(/^git@github\.com:/, "").replace(/\.git$/, "");
    return {
      service: svc,
      branch: `feat/${id}`,
      repo,
      url: slug ? `https://github.com/${slug}/pull/new/feat/${id}` : "",
      state: "draft" as const,
      checks: "pending" as const,
      live: false,
    };
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
    setTimeout(tick, 350);
  };
  tick();
}

/** Builds the Garry HTTP server (REST plus SSE) over the supervisor. */
export function createGarryServer(cfg: ServerConfig): Server {
  return createServer((req, res) => {
    void handle(req, res, cfg).catch((e) => json(res, 500, { error: String((e as Error).message ?? e) }));
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, cfg: ServerConfig): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // POST per service model override
  const postModels = /^\/api\/features\/([^/]+)\/service-models$/.exec(path);
  if (req.method === "POST" && postModels) {
    const id = decodeURIComponent(postModels[1]);
    const body = (await readBody(req)) as { service?: string; model?: string };
    if (!body.service || !body.model) return json(res, 400, { error: "service and model are required" });
    if (!isKnownModel(body.model)) return json(res, 400, { error: `unknown model: ${body.model}` });
    const current = serviceModels.get(id) ?? {};
    current[body.service] = body.model;
    serviceModels.set(id, current);
    return json(res, 200, { ok: true, serviceModels: current });
  }

  if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });

  if (path === "/" || path === "/health") {
    return json(res, 200, {
      ok: true,
      service: "garry-server",
      endpoints: [
        "GET /api/features",
        "GET /api/features/:id/plan",
        "GET /api/features/:id/stream (SSE)",
        "GET /api/features/:id/prs",
        "GET /api/features/:id/service-models",
        "POST /api/features/:id/service-models {service, model}",
        "GET /api/skills",
        "GET /api/registry",
        "GET /api/routing",
        "GET /api/models",
      ],
    });
  }
  if (path === "/api/features") return json(res, 200, { features: listFeatures(cfg.registry) });
  if (path === "/api/skills") return json(res, 200, { skills: loadSkills(cfg.skills) });
  if (path === "/api/models") return json(res, 200, { models: MODELS });
  if (path === "/api/registry") {
    return json(res, 200, { services: listManifests(cfg.registry), contracts: readContracts(cfg.registry) });
  }
  if (path === "/api/routing") {
    const data = existsSync(cfg.routing) ? JSON.parse(readFileSync(cfg.routing, "utf8")) : { defaults: null, stages: {} };
    return json(res, 200, data);
  }

  const plan = /^\/api\/features\/([^/]+)\/plan$/.exec(path);
  if (plan) return json(res, 200, planFor(cfg, decodeURIComponent(plan[1])));

  const prs = /^\/api\/features\/([^/]+)\/prs$/.exec(path);
  if (prs) return json(res, 200, { prs: prsFor(cfg, decodeURIComponent(prs[1])) });

  const getModels = /^\/api\/features\/([^/]+)\/service-models$/.exec(path);
  if (getModels) return json(res, 200, { serviceModels: serviceModels.get(decodeURIComponent(getModels[1])) ?? {} });

  const stream = /^\/api\/features\/([^/]+)\/stream$/.exec(path);
  if (stream) return streamPlan(res, cfg, decodeURIComponent(stream[1]));

  json(res, 404, { error: "not found", path });
}
