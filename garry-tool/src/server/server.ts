import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildPlan, listFeatures, loadFeature } from "../orchestrate/plan.js";
import { loadSkills } from "../orchestrate/skillsManifest.js";
import { describe } from "../orchestrate/delegate.js";
import { MODELS, isKnownModel } from "../orchestrate/models.js";
import { loadWorkspace } from "../workspace/workspace.js";
import { listManifests, readContracts } from "../sync/registryIO.js";
import { readdirSync } from "node:fs";

/** Updates the status: field in a feature markdown frontmatter. Returns false if not found. */
function setFeatureStatus(registry: string, id: string, status: string): boolean {
  const dir = join(registry, "features");
  if (!existsSync(dir)) return false;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    const file = join(dir, f);
    const src = readFileSync(file, "utf8");
    const m = /^(---\r?\n[\s\S]*?\r?\n---)/.exec(src);
    if (!m) continue;
    if (!new RegExp(`(^|\\n)\\s*id:\\s*${id}(\\s|$)`).test(m[1])) continue;
    const updated = m[1].replace(/(\n\s*status:\s*).*/, `$1${status}`);
    writeFileSync(file, src.replace(m[1], updated));
    return true;
  }
  return false;
}
import { githubToken } from "../github/env.js";
import { GitHub, parseSlug } from "../github/client.js";

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

/**
 * PR view per service. With a GARRY_GITHUB_TOKEN set, it returns live state and
 * check results from GitHub. Without a token it returns the derived view so the
 * UI still shows the pull requests Garry would open.
 */
async function prsFor(cfg: ServerConfig, id: string) {
  const feature = loadFeature(cfg.registry, id);
  const manifests = new Map(listManifests(cfg.registry).map((m) => [m.name, m]));
  const branch = `feat/${id}`;
  const token = githubToken();
  const gh = token ? new GitHub(token) : null;

  return Promise.all(
    feature.services.map(async (svc) => {
      const repo = (manifests.get(svc)?.repo as string) ?? "";
      const slug = parseSlug(repo);
      const base = {
        service: svc,
        branch,
        repo,
        url: slug ? `https://github.com/${slug.owner}/${slug.name}/pull/new/${branch}` : "",
        state: "draft" as string,
        checks: "pending" as string,
        live: false,
      };
      if (!gh || !slug) return base;
      try {
        const pr = await gh.prForBranch(slug.owner, slug.name, branch);
        if (!pr) return { ...base, state: "none" };
        return { service: svc, branch, repo, url: pr.url, state: pr.draft ? "draft" : pr.state, checks: pr.checks, live: true };
      } catch {
        return base;
      }
    }),
  );
}

/** A short human readable action for a skill, for the agent work log. */
function actionFor(skill: string): string {
  const map: Record<string, string> = {
    "spec-draft": "drafted the feature spec",
    "spec-decompose": "decomposed into affected services",
    "acceptance-criteria": "wrote acceptance criteria",
    "impact-analysis": "analysed contract impact",
    "dependency-graph": "built the dependency graph",
    "work-breakdown": "broke work into per repo tasks",
    "contract-update": "updated the registry contracts",
    "contract-validate": "validated the contracts",
    "version-bump": "bumped the registry version",
    "design-tokens-sync": "synced design tokens",
    "scaffold-mfe-shell": "scaffolded the shell host",
    "scaffold-mfe-remote": "scaffolded the remote",
    "sync-contracts": "injected the contract slice into .garry/",
    "generate-types": "generated contract types",
    "mf-wiring": "wired Module Federation",
    "review-correctness": "reviewed for correctness",
    "review-spec-match": "checked against acceptance criteria",
    "review-contract-compliance": "verified contract compliance",
    "review-security": "ran a security review",
    "test-unit": "ran unit tests",
    "test-e2e": "ran end to end tests",
    "drift-check": "checked for contract drift",
    "cross-repo-merge": "coordinated the cross repo merge",
    "version-tag": "tagged the versions",
    "changelog": "generated the changelog",
    "api-contract": "updated the API contract",
    "db-provision": "provisioned the database",
    "db-migrate": "ran the migrations",
    "api-compatibility": "checked API compatibility",
  };
  return map[skill] ?? `ran ${skill}`;
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

  let ti = 0;
  const runTask = () => {
    if (ti >= plan.tasks.length) {
      res.write("event: done\ndata: {}\n\n");
      res.end();
      return;
    }
    const task = plan.tasks[ti];
    const index = ti + 1;
    const who = task.scope === "service" ? (task.service ?? "service") : "supervisor";
    res.write(`event: task\ndata: ${JSON.stringify({ index, task, text: describe(task) })}\n\n`);

    let si = 0;
    const runSkill = () => {
      if (si >= task.skills.length) {
        ti++;
        setTimeout(runTask, 140);
        return;
      }
      const skill = task.skills[si++];
      const entry = { index, stage: task.stage, who, agent: task.agent, model: task.model, skill, action: actionFor(skill) };
      res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
      setTimeout(runSkill, 170);
    };
    setTimeout(runSkill, 120);
  };
  runTask();
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

  // POST a feature status change (kanban drag), persisted to the feature frontmatter
  const postStatus = /^\/api\/features\/([^/]+)\/status$/.exec(path);
  if (req.method === "POST" && postStatus) {
    const id = decodeURIComponent(postStatus[1]);
    const body = (await readBody(req)) as { status?: string };
    if (!body.status) return json(res, 400, { error: "status is required" });
    const ok = setFeatureStatus(cfg.registry, id, body.status);
    if (!ok) return json(res, 404, { error: `feature ${id} not found` });
    return json(res, 200, { ok: true, id, status: body.status });
  }

  // POST a routing change: set the model for a stage (the agent stays)
  if (req.method === "POST" && path === "/api/routing") {
    const body = (await readBody(req)) as { stage?: string; model?: string };
    if (!body.stage || !body.model) return json(res, 400, { error: "stage and model are required" });
    if (!isKnownModel(body.model)) return json(res, 400, { error: `unknown model: ${body.model}` });
    const routing = existsSync(cfg.routing)
      ? (JSON.parse(readFileSync(cfg.routing, "utf8")) as {
          defaults?: { agent: string; model: string };
          stages?: Record<string, { agent: string; model: string }>;
        })
      : { defaults: { agent: "garry-dev", model: body.model }, stages: {} };
    routing.stages = routing.stages ?? {};
    const agent = routing.stages[body.stage]?.agent ?? routing.defaults?.agent ?? "garry-dev";
    routing.stages[body.stage] = { agent, model: body.model };
    writeFileSync(cfg.routing, JSON.stringify(routing, null, 2) + "\n");
    return json(res, 200, routing);
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
  if (prs) return json(res, 200, { prs: await prsFor(cfg, decodeURIComponent(prs[1])) });

  const getModels = /^\/api\/features\/([^/]+)\/service-models$/.exec(path);
  if (getModels) return json(res, 200, { serviceModels: serviceModels.get(decodeURIComponent(getModels[1])) ?? {} });

  const stream = /^\/api\/features\/([^/]+)\/stream$/.exec(path);
  if (stream) return streamPlan(res, cfg, decodeURIComponent(stream[1]));

  json(res, 404, { error: "not found", path });
}
