import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { MODELS } from "../orchestrate/models.js";
import { DEVICE_COOKIE, DeviceStore, hostAllowed, isLoopback, requestToken } from "./auth.js";
import { serveUi } from "./static.js";
import { ThreadManager } from "../threads/manager.js";
import { SERVICE_KINDS } from "../registry/schema/kinds.js";
import { TerminalManager } from "../terminal/terminal.js";
import { threadRoutes } from "../threads/routes.js";
import { GarryQueue } from "../garry/queue.js";
import { queueRoutes } from "../garry/routes.js";
import { activeGarryProject } from "../project/store.js";
import { liveView } from "../status/live.js";
import { garryStatus } from "../status/status.js";
import { pushEnabled } from "../status/push.js";
import { CORS, json, readBody, writeAllowed, type RouteCtx } from "./http.js";
import { featureRoutes } from "./features-routes.js";
import { registryRoutes } from "./registry-routes.js";
import { skillRoutes } from "./skills-routes.js";
import { projectRoutes } from "./projects-routes.js";
import { terminalRoutes } from "./terminal-routes.js";
import { ENDPOINTS } from "./endpoints.js";

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
  /** what you tell Garry, in order (garry/queue.ts); one is created when not given */
  queue?: GarryQueue;
  /** shells opened from the Files tab; one is created when not given */
  terminals?: TerminalManager;
}

/** Builds the Garry HTTP server (REST plus SSE) over the supervisor. */
export function createGarryServer(cfg: ServerConfig, devices = new DeviceStore()): Server {
  cfg.threads ??= new ThreadManager();
  const queue = (cfg.queue ??= new GarryQueue(cfg.threads));
  const terminals = (cfg.terminals ??= new TerminalManager());
  const server = createServer((req, res) => {
    void handle(req, res, cfg, devices).catch((e) => json(res, 500, { error: String((e as Error).message ?? e) }));
  });
  server.on("close", () => (terminals.closeAll(), queue.close()));
  return server;
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

  // A paired phone asks to be notified (or stops): its own push token, nothing else
  if (path === "/api/push/token") {
    if (!device) return json(res, 400, { error: "only a paired device registers for notifications" });
    if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
    const body = (await readBody(req)) as { token?: string | null };
    try {
      devices.setPushToken(device.id, body.token ? String(body.token) : null);
      return json(res, 200, { ok: true, notifications: Boolean(body.token), enabled: pushEnabled() });
    } catch (e) {
      return json(res, 400, { error: String((e as Error).message ?? e) });
    }
  }

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

  // Terminals for the Files tab: a shell is this computer's to open, never a paired device's
  if (path === "/api/terminals" || path.startsWith("/api/terminals/")) {
    if (!local) return json(res, 403, { error: "the terminal opens on the computer running Garry" });
    return terminalRoutes(req, res, path, cfg);
  }

  // Projects and agent threads (the IDE): this machine and paired devices
  if (path.startsWith("/api/projects") || path.startsWith("/api/threads")) {
    const sseHeaders = { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...CORS };
    if (await threadRoutes(req, res, path, { threads: cfg.threads!, local, json, readBody, sseHeaders })) return;
  }

  // Talking to Garry: messages in line, one at a time (garry/routes.ts)
  if (path.startsWith("/api/garry/queue") && (await queueRoutes(req, res, path, { queue: cfg.queue!, threads: cfg.threads!, json, readBody }))) return;


  // The rest, each group in a module of its own: GitHub and Garry projects, the
  // registry (files, services, boards, stacks, routing), skills, features
  const ctx: RouteCtx = { cfg, local, url };
  for (const group of [projectRoutes, registryRoutes, skillRoutes, featureRoutes]) if ((await group(req, res, path, ctx)) !== false) return;

  // Garry at a glance (the Mac menu bar, the iPhone app): working, needs you, ready; the active project's work
  if (req.method === "GET" && path === "/api/status") {
    if (!cfg.threads) return json(res, 200, { state: "idle", counts: { needsYou: 0, working: 0, done: 0 }, items: [] });
    const store = cfg.threads.store;
    const repos = new Set(store.projectsOf(activeGarryProject().id).map((r) => r.id));
    const ids = new Set(store.threads().filter((t) => repos.has(t.projectId)).map((t) => t.id));
    return json(res, 200, garryStatus(cfg.threads, ids));
  }

  // Live: every agent of the active project as a lane on a timeline (status/live.ts);
  // ?hours= how far back a finished lane still shows, a day by default
  if (req.method === "GET" && path === "/api/live") {
    if (!cfg.threads) return json(res, 200, { now: new Date().toISOString(), lanes: [], needsYou: [], spentToday: 0 });
    const store = cfg.threads.store;
    const repos = new Set(store.projectsOf(activeGarryProject().id).map((r) => r.id));
    const ids = new Set(store.threads().filter((t) => repos.has(t.projectId)).map((t) => t.id));
    const hours = Math.min(Math.max(Number(new URL(req.url ?? "/", "http://x").searchParams.get("hours")) || 24, 1), 24 * 14);
    return json(res, 200, liveView(cfg.threads, ids, new Date(Date.now() - hours * 3600_000)));
  }

  if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });

  if (path === "/" || path === "/health") {
    // with no dashboard to serve, / answers with the API overview
    return json(res, 200, { ok: true, service: "garry-server", endpoints: ENDPOINTS });
  }
  if (path === "/api/models") return json(res, 200, { models: MODELS });
  if (path === "/api/service-kinds") return json(res, 200, { kinds: SERVICE_KINDS });

  json(res, 404, { error: "not found", path });
}
