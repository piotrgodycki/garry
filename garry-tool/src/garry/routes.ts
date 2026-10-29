import type { IncomingMessage, ServerResponse } from "node:http";
import type { ThreadManager } from "../threads/manager.js";
import { activeGarryProject } from "../project/store.js";
import type { GarryQueue } from "./queue.js";

/**
 * Talking to Garry: GET /api/garry/queue (what you said, newest last, and
 * where it goes), POST /api/garry/queue {text, projectId?} (in line; the
 * project's first repository when none is named), DELETE
 * /api/garry/queue/:id (a message that has not started). This machine and
 * paired devices.
 */
export async function queueRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  ctx: { queue: GarryQueue; threads: ThreadManager; json: (res: ServerResponse, code: number, body: unknown) => void; readBody: (req: IncomingMessage) => Promise<unknown> },
): Promise<boolean> {
  const { queue, threads, json } = ctx;
  const repos = () => threads.store.projectsOf(activeGarryProject().id);
  const mine = () => {
    const ids = new Set(repos().map((r) => r.id));
    return queue.list().filter((i) => ids.has(i.projectId));
  };
  if (path === "/api/garry/queue") {
    if (req.method === "GET") return (json(res, 200, { items: mine(), repos: repos().map((r) => ({ id: r.id, name: r.name })) }), true);
    if (req.method === "POST") {
      const body = (await ctx.readBody(req)) as { text?: string; projectId?: string };
      const projectId = body.projectId || repos()[0]?.id;
      if (!projectId) return (json(res, 400, { error: "add a repository to this project first (Build)" }), true);
      if (!repos().some((r) => r.id === projectId)) return (json(res, 400, { error: "that repository is not in this project" }), true);
      try {
        return (json(res, 200, queue.add(String(body.text ?? ""), projectId)), true);
      } catch (e) {
        return (json(res, 400, { error: String((e as Error).message ?? e) }), true);
      }
    }
  }
  const one = /^\/api\/garry\/queue\/([a-z0-9]{4,16})$/.exec(path);
  if (one && req.method === "DELETE") {
    if (!mine().some((i) => i.id === one[1])) return (json(res, 404, { error: "no such message" }), true);
    return queue.cancel(one[1]) ? (json(res, 200, { cancelled: true }), true) : (json(res, 409, { error: "it has already started; stop it in Build" }), true);
  }
  return false;
}
