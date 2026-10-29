import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerConfig } from "./server.js";

/** What every group of routes gets: the server's settings, whether the request comes from this computer, its URL. */
export interface RouteCtx {
  cfg: ServerConfig;
  local: boolean;
  url: URL;
}

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
} as const;

/**
 * Pages Garry serves from may write; any other site the user happens to have open
 * in the browser may not (a request to localhost would otherwise be enough to
 * install a skill, that is instructions for the agents). Requests with no Origin
 * (the CLI, curl) are allowed. GARRY_UI_ORIGINS adds origins, comma separated.
 */
export function writeAllowed(req: IncomingMessage): boolean {
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

export function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(body, null, 2));
}

export function readBody(req: IncomingMessage, limit = 1_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) reject(new Error("body too large"));
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
