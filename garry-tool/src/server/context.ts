import type { IncomingMessage, ServerResponse } from "node:http";
import type { GarryQueue } from "../garry/queue.js";
import type { Teams } from "../garry/teams.js";
import type { GarryProject } from "../project/store.js";
import type { TerminalManager } from "../terminal/terminal.js";
import type { ThreadManager } from "../threads/manager.js";
import type { Project } from "../threads/store.js";
import type { Device, DeviceStore } from "./auth.js";
import type { ServerConfig } from "./server.js";

export interface Services {
  threads: ThreadManager;
  queue: GarryQueue;
  teams: Teams;
  terminals: TerminalManager;
  devices: DeviceStore;
}

/** Everything a route needs, decided once per request after the caller was let in. */
export interface RouteCtx {
  cfg: ServerConfig;
  services: Services;
  url: URL;
  /** the request comes from this computer */
  local: boolean;
  /** the paired device making the request; null on this computer */
  device: Device | null;
  /** the Garry project in use when the request came in */
  project: GarryProject;
  repos(): Project[];
}

/** Handles the request and returns anything but false, or returns false to let the next group try. */
export type RouteGroup = (req: IncomingMessage, res: ServerResponse, path: string, ctx: RouteCtx) => Promise<boolean | void>;
