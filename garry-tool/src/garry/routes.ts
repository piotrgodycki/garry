import { CommandError, commandList, runCommand } from "./commands.js";
import { MemoryError, forget, readMemory, remember } from "./memory.js";
import type { RouteGroup } from "../server/context.js";
import { json, readBody } from "../server/http.js";

/**
 * /api/garry/queue, /commands and /memory, for this machine and paired devices.
 * A message without projectId goes to the project's first repository.
 */
export const queueRoutes: RouteGroup = async (req, res, path, { services: { queue, threads, teams }, cfg, repos }) => {
  if (!/^\/api\/garry\/(queue|commands|memory)(\/|$)/.test(path)) return false;
  const fail = (e: unknown) => {
    if (e instanceof CommandError || e instanceof MemoryError) return json(res, e.status, { error: e.message });
    return json(res, 400, { error: String((e as Error).message ?? e) });
  };
  const mine = () => {
    const ids = new Set(repos().map((r) => r.id));
    return queue.list().filter((i) => ids.has(i.projectId));
  };
  if (path === "/api/garry/queue") {
    if (req.method === "GET") return json(res, 200, { items: mine(), repos: repos().map((r) => ({ id: r.id, name: r.name })) });
    if (req.method === "POST") {
      const body = (await readBody(req)) as { text?: string; projectId?: string };
      const projectId = body.projectId || repos()[0]?.id;
      if (!projectId) return json(res, 400, { error: "add a repository to this project first (Build)" });
      if (!repos().some((r) => r.id === projectId)) return json(res, 400, { error: "that repository is not in this project" });
      try {
        return json(res, 200, queue.add(String(body.text ?? ""), projectId));
      } catch (e) {
        return json(res, 400, { error: String((e as Error).message ?? e) });
      }
    }
  }
  if (path === "/api/garry/commands" && req.method === "GET") return json(res, 200, { commands: commandList() });
  if (path === "/api/garry/commands" && req.method === "POST") {
    const body = (await readBody(req)) as { text?: unknown };
    try {
      return json(res, 200, runCommand(String(body.text ?? ""), { registry: cfg.registry, repos: repos(), threads, teams, queue }));
    } catch (e) {
      return fail(e);
    }
  }
  if (path === "/api/garry/memory") {
    if (req.method === "GET") return json(res, 200, { entries: readMemory(cfg.registry) });
    if (req.method === "POST") {
      try {
        return json(res, 200, remember(cfg.registry, String(((await readBody(req)) as { text?: unknown }).text ?? "")));
      } catch (e) {
        return fail(e);
      }
    }
  }
  const mem = /^\/api\/garry\/memory\/([a-f0-9]{10})$/.exec(path);
  if (mem && req.method === "DELETE") {
    try {
      return json(res, 200, forget(cfg.registry, mem[1]));
    } catch (e) {
      return fail(e);
    }
  }
  const one = /^\/api\/garry\/queue\/([a-z0-9]{4,16})$/.exec(path);
  if (one && req.method === "DELETE") {
    if (!mine().some((i) => i.id === one[1])) return json(res, 404, { error: "no such message" });
    return queue.cancel(one[1]) ? (json(res, 200, { cancelled: true }), true) : (json(res, 409, { error: "it has already started; stop it in Build" }), true);
  }
  return false;
};
