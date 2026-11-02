import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { GarryQueue } from "../garry/queue.js";
import { queueRoutes } from "../garry/routes.js";
import { teamRoutes } from "../garry/team-routes.js";
import { Teams } from "../garry/teams.js";
import { activeGarryProject } from "../project/store.js";
import { TerminalManager } from "../terminal/terminal.js";
import { ThreadManager } from "../threads/manager.js";
import { threadRoutes } from "../threads/routes.js";
import { DeviceStore } from "./auth.js";
import type { RouteCtx, RouteGroup, Services } from "./context.js";
import { deviceRoutes, pairRoute } from "./device-routes.js";
import { featureRoutes } from "./features-routes.js";
import { admit, writeRefused } from "./guards.js";
import { CORS, json } from "./http.js";
import { layerRoutes, wireAgentContext } from "./layers-routes.js";
import { projectRoutes } from "./projects-routes.js";
import { registryRoutes } from "./registry-routes.js";
import { skillRoutes } from "./skills-routes.js";
import { serveUi } from "./static.js";
import { statusRoutes } from "./status-routes.js";
import { terminalRoutes } from "./terminal-routes.js";

export interface ServerConfig {
  registry: string;
  skills: string;
  routing: string;
  root?: string;
  /** the built dashboard to serve (garry-ui/dist); none serves the API only */
  ui?: string;
  /** host names this server answers to besides localhost (the --host address) */
  hosts?: string[];
  threads?: ThreadManager;
  queue?: GarryQueue;
  teams?: Teams;
  terminals?: TerminalManager;
}

/** Tried in order after the caller was let in; the first that handles the request wins. */
const ROUTES: RouteGroup[] = [
  deviceRoutes,
  terminalRoutes,
  threadRoutes,
  queueRoutes,
  teamRoutes,
  projectRoutes,
  registryRoutes,
  layerRoutes,
  skillRoutes,
  featureRoutes,
  statusRoutes,
];

export function createGarryServer(cfg: ServerConfig, devices = new DeviceStore()): Server {
  const threads = (cfg.threads ??= new ThreadManager());
  wireAgentContext(cfg, threads);
  const services: Services = {
    threads,
    queue: (cfg.queue ??= new GarryQueue(threads)),
    teams: (cfg.teams ??= new Teams(threads)),
    terminals: (cfg.terminals ??= new TerminalManager()),
    devices,
  };
  const server = createServer((req, res) => {
    void handle(req, res, cfg, services).catch((e) => json(res, 500, { error: String((e as Error).message ?? e) }));
  });
  server.on("close", () => {
    services.terminals.closeAll();
    services.queue.close();
    services.teams.close();
  });
  return server;
}

async function handle(req: IncomingMessage, res: ServerResponse, cfg: ServerConfig, services: Services): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const caller = admit(req, res, url, cfg.hosts ?? [], services.devices);
  if (!caller) return;
  // the dashboard itself holds no data, so it is served to anyone the host check let through
  if ((req.method === "GET" || req.method === "HEAD") && !path.startsWith("/api/") && path !== "/health" && serveUi(req, res, cfg.ui, path)) return;
  if (req.method === "POST" && path === "/api/pair") return pairRoute(req, res, services.devices);
  if (!caller.local && !caller.device) {
    return json(res, 401, { error: "pair this device first: run garry pair on the computer running Garry" });
  }
  // device management checks its own origin; registering for notifications comes from the apps
  const ownChecks = path === "/api/push/token" || path === "/api/pair/codes" || path.startsWith("/api/devices");
  if (!ownChecks && writeRefused(req, res, caller)) return;

  const project = activeGarryProject();
  const ctx: RouteCtx = { cfg, services, url, ...caller, project, repos: () => services.threads.store.projectsOf(project.id) };
  for (const route of ROUTES) if ((await route(req, res, path, ctx)) !== false) return;

  if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
  json(res, 404, { error: "not found", path });
}
