import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildPlan, listFeatures, loadFeature } from "../orchestrate/plan.js";
import { loadBuiltinSkills, loadSkills } from "../orchestrate/skillsManifest.js";
import { SkillError, installSkill, listLocalSkills, localSkillsDir, readLocalSkillMd, removeSkill, skillsPolicy, type InstallRequest } from "../skills/local.js";
import { AUDIT_RULES, auditFiles, readSkillFolder } from "../skills/audit.js";
import { proposeSkill, skillsRepo } from "../skills/propose.js";
import { describe } from "../orchestrate/delegate.js";
import { MODELS, isKnownModel } from "../orchestrate/models.js";
import { loadWorkspace } from "../workspace/workspace.js";
import { listManifests, readContracts } from "../sync/registryIO.js";
import { DEVICE_COOKIE, DeviceStore, hostAllowed, isLoopback, requestToken } from "./auth.js";
import { serveUi } from "./static.js";
import { ThreadManager } from "../threads/manager.js";
import { threadRoutes } from "../threads/routes.js";
import { readdirSync } from "node:fs";
import { ServiceError, addService, removeService, type ServiceInput } from "../registry/services.js";
import { FeatureError, createFeature, removeFeature, type FeatureInput } from "../registry/features.js";

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
  /** the built dashboard to serve (garry-ui/dist); none serves the API only */
  ui?: string;
  /** host names this server answers to besides localhost (the --host address) */
  hosts?: string[];
  /** projects and agent threads; one is created when not given */
  threads?: ThreadManager;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
} as const;

// In memory per service model overrides, keyed by feature id. Resets on restart.
const serviceModels = new Map<string, Record<string, string>>();

/**
 * Pages Garry serves from may write; any other site the user happens to have open
 * in the browser may not (a request to localhost would otherwise be enough to
 * install a skill, that is instructions for the agents). Requests with no Origin
 * (the CLI, curl) are allowed. GARRY_UI_ORIGINS adds origins, comma separated.
 */
function writeAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = new Set([
    // the dashboard served by this server (the Host header is checked before this)
    `http://${req.headers.host}`,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...(process.env.GARRY_UI_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
  ]);
  return allowed.has(origin);
}

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
    "review-screenshots": "posted screenshots of the change on the PR",
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
export function createGarryServer(cfg: ServerConfig, devices = new DeviceStore()): Server {
  cfg.threads ??= new ThreadManager();
  return createServer((req, res) => {
    void handle(req, res, cfg, devices).catch((e) => json(res, 500, { error: String((e as Error).message ?? e) }));
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, cfg: ServerConfig, devices: DeviceStore): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // A web page that rebinds its own domain to 127.0.0.1 would otherwise pass as
  // this machine: only answer to the names this server is reached by.
  const local = isLoopback(req);
  if (!hostAllowed(req, cfg.hosts ?? [])) return json(res, 403, { error: `unknown host ${req.headers.host}; add it with --host` });

  // The dashboard itself is public (it holds no data); /api is not.
  if ((req.method === "GET" || req.method === "HEAD") && !path.startsWith("/api/") && path !== "/health") {
    if (serveUi(req, res, cfg.ui, path)) return;
  }

  // Pairing: the only endpoint another device may call without a token. A browser
  // asks for a session cookie (HttpOnly, never readable by scripts); the apps keep
  // the token and send it as a bearer header.
  if (req.method === "POST" && path === "/api/pair") {
    const body = (await readBody(req)) as { code?: string; name?: string; session?: string };
    if (typeof body.code !== "string" || !body.code) return json(res, 400, { error: "code is required" });
    const r = devices.pair(body.code, typeof body.name === "string" ? body.name : "");
    if ("error" in r) return json(res, r.status, { error: r.error });
    if (body.session === "cookie") {
      res.setHeader("set-cookie", `${DEVICE_COOKIE}=${r.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`);
      return json(res, 200, { device: r.device });
    }
    return json(res, 200, r);
  }

  // This machine is trusted; every other device needs a paired device token.
  const presented = local ? null : requestToken(req, url);
  const device = presented ? devices.verify(presented) : null;
  if (!local && !device) return json(res, 401, { error: "pair this device first: run garry pair on the computer running Garry" });

  // Managing devices is for this machine only, so a stolen token cannot mint more.
  if (path === "/api/pair/codes" || path.startsWith("/api/devices")) {
    if (!local || !writeAllowed(req)) return json(res, 403, { error: "devices are managed on the computer running Garry" });
    if (req.method === "POST" && path === "/api/pair/codes") return json(res, 200, devices.createCode());
    if (req.method === "GET" && path === "/api/devices") {
      return json(res, 200, { devices: devices.list().map(({ tokenHash: _, ...d }) => d) });
    }
    const del = /^\/api\/devices\/([^/]+)$/.exec(path);
    if (req.method === "DELETE" && del) {
      return devices.revoke(decodeURIComponent(del[1])) ? json(res, 200, { ok: true }) : json(res, 404, { error: "no such device" });
    }
    return json(res, 404, { error: "not found", path });
  }

  // A bearer token is never sent by a browser on its own, so an app's writes need
  // no origin check. This machine and paired browsers (cookie) do: another site
  // open in the same browser must not be able to write.
  const bearer = Boolean(device && req.headers.authorization?.startsWith("Bearer "));
  if ((req.method === "POST" || req.method === "DELETE") && !bearer && !writeAllowed(req)) {
    return json(res, 403, { error: `writes are not allowed from ${req.headers.origin}; add it to GARRY_UI_ORIGINS` });
  }

  // Projects and agent threads (the IDE): this machine and paired devices
  if (path === "/api/projects" || path.startsWith("/api/threads")) {
    const sseHeaders = { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...CORS };
    if (await threadRoutes(req, res, path, { threads: cfg.threads!, local, json, readBody, sseHeaders })) return;
  }

  // Services: add one to the registry (this machine and paired devices), remove one (this machine only)
  if (req.method === "POST" && path === "/api/registry/services") {
    const body = (await readBody(req)) as ServiceInput & { replace?: boolean };
    try {
      return json(res, 200, addService(cfg.registry, body, { replace: body.replace === true }));
    } catch (e) {
      if (e instanceof ServiceError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }
  const delService = /^\/api\/registry\/services\/([^/]+)$/.exec(path);
  if (req.method === "DELETE" && delService) {
    if (!local) return json(res, 403, { error: "only this computer can remove services" });
    try {
      removeService(cfg.registry, decodeURIComponent(delService[1]));
      return json(res, 200, { ok: true });
    } catch (e) {
      if (e instanceof ServiceError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }

  // Features: create one (this machine and paired devices), remove one (this machine only)
  if (req.method === "POST" && path === "/api/features") {
    try {
      return json(res, 200, createFeature(cfg.registry, (await readBody(req)) as FeatureInput));
    } catch (e) {
      if (e instanceof FeatureError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }
  const delFeature = /^\/api\/features\/([^/]+)$/.exec(path);
  if (req.method === "DELETE" && delFeature) {
    if (!local) return json(res, 403, { error: "only this computer can remove features" });
    try {
      removeFeature(cfg.registry, decodeURIComponent(delFeature[1]));
      serviceModels.delete(decodeURIComponent(delFeature[1]));
      return json(res, 200, { ok: true });
    } catch (e) {
      if (e instanceof FeatureError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }

  // Skills: install a local skill (upload or folder), remove one, read its instructions
  if (req.method === "POST" && path === "/api/skills/install") {
    const body = (await readBody(req)) as InstallRequest;
    try {
      const reserved = new Set(loadBuiltinSkills(cfg.skills).map((sk) => sk.name));
      return json(res, 200, installSkill(body, reserved));
    } catch (e) {
      if (e instanceof SkillError) return json(res, e.status, { error: e.message, audit: e.audit });
      throw e;
    }
  }
  // Propose a skill to the team: a pull request that the skill-audit workflow and a reviewer must pass
  if (req.method === "POST" && path === "/api/skills/propose") {
    const body = (await readBody(req)) as InstallRequest;
    const token = githubToken();
    if (!token) return json(res, 400, { error: "set GARRY_GITHUB_TOKEN in .env.local to open pull requests" });
    try {
      const reserved = new Set(loadBuiltinSkills(cfg.skills).map((sk) => sk.name));
      return json(res, 200, await proposeSkill(body, reserved, { token }));
    } catch (e) {
      if (e instanceof SkillError) return json(res, e.status, { error: e.message, audit: e.audit });
      throw e;
    }
  }
  const delSkill = /^\/api\/skills\/([^/]+)$/.exec(path);
  if (req.method === "DELETE" && delSkill) {
    try {
      removeSkill(decodeURIComponent(delSkill[1]));
      return json(res, 200, { ok: true });
    } catch (e) {
      if (e instanceof SkillError) return json(res, e.status, { error: e.message });
      throw e;
    }
  }
  if (req.method === "GET" && path === "/api/skills/audit-rules") return json(res, 200, { rules: AUDIT_RULES });
  const skillAudit = /^\/api\/skills\/([^/]+)\/audit$/.exec(path);
  if (req.method === "GET" && skillAudit) {
    const name = decodeURIComponent(skillAudit[1]);
    const local = listLocalSkills().find((sk) => sk.name === name);
    if (local) return json(res, 200, { name, source: "local", audit: local.audit });
    const raw = JSON.parse(readFileSync(join(cfg.skills, "manifest.json"), "utf8")) as { skills: { name: string; path?: string }[] };
    const entry = raw.skills.find((sk) => sk.name === name);
    if (!entry) return json(res, 404, { error: `no skill ${name}` });
    const folder = entry.path ? join(cfg.skills, entry.path) : "";
    if (!folder || !existsSync(join(folder, "SKILL.md"))) return json(res, 200, { name, source: "builtin", audit: null });
    return json(res, 200, { name, source: "builtin", audit: auditFiles(readSkillFolder(folder)) });
  }
  const skillDoc = /^\/api\/skills\/([^/]+)\/doc$/.exec(path);
  if (req.method === "GET" && skillDoc) {
    const name = decodeURIComponent(skillDoc[1]);
    const local = readLocalSkillMd(name);
    if (local !== null) return json(res, 200, { name, source: "local", doc: local });
    const raw = JSON.parse(readFileSync(join(cfg.skills, "manifest.json"), "utf8")) as { skills: { name: string; path?: string }[] };
    const entry = raw.skills.find((sk) => sk.name === name);
    const md = entry?.path ? join(cfg.skills, entry.path, "SKILL.md") : "";
    if (!entry) return json(res, 404, { error: `no skill ${name}` });
    return json(res, 200, { name, source: "builtin", doc: md && existsSync(md) ? readFileSync(md, "utf8") : null });
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
    // with no dashboard to serve, / answers with the API overview
    return json(res, 200, {
      ok: true,
      service: "garry-server",
      endpoints: [
        "POST /api/pair {code, name} (another device trades a pairing code for a token)",
        "POST /api/pair/codes (this machine only)",
        "GET /api/devices, DELETE /api/devices/:id (this machine only)",
        "GET /api/projects, POST /api/projects {path, name?} (this machine only)",
        "GET /api/threads?project=, POST /api/threads {projectId, prompt, title?}",
        "GET /api/threads/:id, GET /api/threads/:id/events (SSE), GET /api/threads/:id/diff",
        "POST /api/threads/:id/messages {text}, /stop, /commit {message}, /pr {title?, body?}",
        "DELETE /api/threads/:id (this machine only: removes the worktree and branch)",
        "GET /api/threads/:id/files?path=, GET /api/threads/:id/file?path=, POST /api/threads/:id/file {path, content, sha?} (this machine only)",
        "GET /api/features",
        "POST /api/features {title, goal?, services?, contractChanges?}",
        "DELETE /api/features/:id (this machine only)",
        "GET /api/features/:id/plan",
        "GET /api/features/:id/stream (SSE)",
        "GET /api/features/:id/prs",
        "GET /api/features/:id/service-models",
        "POST /api/features/:id/service-models {service, model}",
        "GET /api/skills",
        "GET /api/skills/:name/doc",
        "GET /api/skills/:name/audit",
        "GET /api/skills/audit-rules",
        "POST /api/skills/install {content | path, stage?, replace?, dryRun?}",
        "DELETE /api/skills/:name (local skills only)",
        "POST /api/skills/propose {content | path, stage?, acknowledge?} (opens a pull request)",
        "GET /api/registry",
        "POST /api/registry/services {name, kind, repo, owner?, stack?, exposes?, consumes?, db?, replace?}",
        "DELETE /api/registry/services/:name (this machine only)",
        "GET /api/routing",
        "GET /api/models",
      ],
    });
  }
  if (path === "/api/features") return json(res, 200, { features: listFeatures(cfg.registry) });
  if (path === "/api/skills") {
    const repo = skillsRepo();
    return json(res, 200, {
      skills: loadSkills(cfg.skills),
      localDir: localSkillsDir(),
      policy: skillsPolicy(),
      propose: { repo: repo ? `${repo.owner}/${repo.name}` : null, ready: Boolean(githubToken() && repo) },
    });
  }
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
