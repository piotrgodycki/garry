import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { TerminalError, terminalEnabled } from "../terminal/terminal.js";
import { CORS, json, readBody } from "./http.js";
import type { ServerConfig } from "./server.js";

/** Where a Files tab root lives on disk: the registry, a repo's checkout, a piece of work's worktree. */
function rootDir(cfg: ServerConfig, root: string): string | null {
  if (root === "registry") {
    mkdirSync(cfg.registry, { recursive: true });
    return cfg.registry;
  }
  const m = /^(project|thread):([a-z0-9]{4,16})$/.exec(root);
  if (!m) return null;
  const store = cfg.threads!.store;
  if (m[1] === "project") return store.project(m[2])?.path ?? null;
  return store.get(m[2])?.worktree ?? null;
}

export async function terminalRoutes(req: IncomingMessage, res: ServerResponse, path: string, cfg: ServerConfig): Promise<void> {
  const terminals = cfg.terminals!;
  const m = req.method ?? "GET";
  try {
    if (path === "/api/terminals") {
      if (m === "GET") return json(res, 200, { enabled: terminalEnabled(), terminals: terminals.list() });
      if (m !== "POST") return json(res, 405, { error: "method not allowed" });
      const body = (await readBody(req)) as { root?: string; cols?: number; rows?: number };
      const root = String(body.root ?? "");
      const dir = rootDir(cfg, root);
      if (!dir) return json(res, 404, { error: `no such folder to open a terminal in: ${root || "(none)"}` });
      return json(res, 200, terminals.open(root, dir, body));
    }
    const one = /^\/api\/terminals\/([a-f0-9]{12})(\/stream|\/input|\/resize)?$/.exec(path);
    if (!one) return json(res, 404, { error: "not found", path });
    const [, id, action = ""] = one;
    if (action === "/stream" && m === "GET") {
      if (!terminals.get(id)) return json(res, 404, { error: "no such terminal" });
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...CORS });
      const off = terminals.attach(id, (e) => {
        if (e.type === "data") res.write(`data: ${JSON.stringify(e.data)}\n\n`);
        else {
          res.write(`event: exit\ndata: ${JSON.stringify({ code: e.code })}\n\n`);
          res.end();
        }
      });
      // the response closes when the viewer goes; the request may close as soon as it was read
      res.on("close", off);
      return;
    }
    if (action === "/input" && m === "POST") {
      const body = (await readBody(req)) as { data?: unknown };
      terminals.write(id, body.data);
      return json(res, 200, { ok: true });
    }
    if (action === "/resize" && m === "POST") {
      await terminals.resize(id, (await readBody(req)) as { cols?: number; rows?: number });
      return json(res, 200, { ok: true });
    }
    if (action === "" && m === "DELETE") {
      terminals.close(id);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: "method not allowed" });
  } catch (e) {
    if (e instanceof TerminalError) return json(res, e.status, { error: e.message });
    throw e;
  }
}
