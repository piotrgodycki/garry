import type { IncomingMessage, ServerResponse } from "node:http";
import type { ThreadManager } from "./manager.js";
import { fileRoute } from "./files.js";

/**
 * /api/projects and /api/threads. Called after the server checked who is
 * asking: this machine, or a paired device (which may start and steer work,
 * the point of pairing a phone). Registering a folder as a project, reading and
 * editing files by hand (a worktree's or a project's) and discarding a
 * thread's work stay on this machine.
 */
export async function threadRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  ctx: {
    threads: ThreadManager;
    local: boolean;
    json: (res: ServerResponse, code: number, body: unknown) => void;
    readBody: (req: IncomingMessage) => Promise<unknown>;
    sseHeaders: Record<string, string>;
  },
): Promise<boolean> {
  const { threads, local, json, readBody } = ctx;
  const store = threads.store;
  const m = req.method ?? "GET";
  const fail = (e: unknown, code = 400) => json(res, code, { error: String((e as Error).message ?? e) });

  if (path === "/api/projects") {
    if (m === "GET") return (json(res, 200, { projects: store.projects() }), true);
    if (m === "POST") {
      if (!local) return (json(res, 403, { error: "projects are added on the computer running Garry" }), true);
      const body = (await readBody(req)) as { path?: string; name?: string };
      try {
        return (json(res, 200, store.addProject(String(body.path ?? ""), body.name)), true);
      } catch (e) {
        return (fail(e), true);
      }
    }
  }

  // a project's own checkout: browse and edit by hand, this computer only
  const proj = /^\/api\/projects\/([a-z0-9]{4,16})(\/files|\/file)$/.exec(path);
  if (proj) {
    const p = store.project(proj[1]);
    if (!p) return (json(res, 404, { error: "no such project" }), true);
    return fileRoute(req, res, proj[2], p.path, { local, json, readBody });
  }

  if (path === "/api/threads") {
    if (m === "GET") {
      const project = new URL(req.url ?? "/", "http://x").searchParams.get("project") ?? undefined;
      return (json(res, 200, { threads: store.threads(project).map((t) => ({ ...t, running: threads.isRunning(t.id) })) }), true);
    }
    if (m === "POST") {
      const body = (await readBody(req)) as { projectId?: string; prompt?: string; title?: string };
      try {
        return (json(res, 200, threads.create(String(body.projectId ?? ""), String(body.prompt ?? ""), body.title)), true);
      } catch (e) {
        return (fail(e), true);
      }
    }
  }

  const one = /^\/api\/threads\/([a-z0-9]{4,16})(\/[a-z]+)?$/.exec(path);
  if (!one) return false;
  const id = one[1];
  const action = one[2] ?? "";
  const t = store.get(id);
  if (!t) return (json(res, 404, { error: "no such thread" }), true);

  try {
    if (m === "GET" && action === "") return (json(res, 200, { thread: { ...t, running: threads.isRunning(id) }, events: store.events(id) }), true);
    if (m === "GET" && action === "/events") {
      // the log so far, then every new event live
      res.writeHead(200, ctx.sseHeaders);
      const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
      for (const e of store.events(id)) send(e);
      const off = threads.subscribe(id, send);
      const ping = setInterval(() => res.write(": ping\n\n"), 20000);
      req.on("close", () => {
        off();
        clearInterval(ping);
      });
      return true;
    }
    if (m === "GET" && action === "/diff") return (json(res, 200, threads.diff(id)), true);
    if (await fileRoute(req, res, action, t.worktree, { local, json, readBody, busy: threads.isRunning(id) ? "the agent is still working; stop it or wait before editing" : undefined })) return true;
    if (m === "POST" && action === "/messages") {
      const body = (await readBody(req)) as { text?: string };
      threads.send(id, String(body.text ?? ""));
      return (json(res, 200, { ok: true }), true);
    }
    if (m === "POST" && action === "/stop") return (json(res, 200, { stopped: threads.stop(id) }), true);
    if (m === "POST" && action === "/commit") {
      const body = (await readBody(req)) as { message?: string };
      return (json(res, 200, threads.commit(id, String(body.message ?? ""))), true);
    }
    if (m === "POST" && action === "/pr") {
      const body = (await readBody(req)) as { title?: string; body?: string };
      return (json(res, 200, await threads.openPr(id, body.title, body.body)), true);
    }
    if (m === "DELETE" && action === "") {
      if (!local) return (json(res, 403, { error: "a thread's work is discarded on the computer running Garry" }), true);
      threads.remove(id);
      return (json(res, 200, { ok: true }), true);
    }
  } catch (e) {
    return (fail(e, /still working|wait for the agent/.test(String(e)) ? 409 : 400), true);
  }
  return (json(res, 405, { error: "method not allowed" }), true);
}
