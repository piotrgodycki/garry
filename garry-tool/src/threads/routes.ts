import { PushError, FileSizeError } from "./manager.js";
import { CreateRepoError, createRepo, proposeRepo } from "../github/create-repo.js";
import { githubToken } from "../github/env.js";
import { remoteSlug } from "./git.js";

const SSE_HEADERS = { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...CORS };

const remoteOf = (path: string) => {
  const s = remoteSlug(path);
  return s ? `${s.owner}/${s.name}` : null;
};
import { fileRoute } from "./files.js";
import { threadState } from "../status/status.js";
import type { RouteGroup } from "../server/context.js";
import { CORS, json, readBody } from "../server/http.js";

/**
 * Runs after the server checked the caller is this machine or a paired device. Adding
 * projects, hand-editing files and discarding work stay on this machine.
 */
export const threadRoutes: RouteGroup = async (req, res, path, { services: { threads }, local, url, project: active, repos }) => {
  if (!path.startsWith("/api/projects") && !path.startsWith("/api/threads")) return false;
  const store = threads.store;
  const m = req.method ?? "GET";
  const fail = (e: unknown, code = 400) => json(res, code, { error: String((e as Error).message ?? e) });

  if (path === "/api/projects") {
    if (m === "GET") return json(res, 200, { projects: repos() });
    if (m === "POST") {
      if (!local) return json(res, 403, { error: "projects are added on the computer running Garry" });
      const body = (await readBody(req)) as { path?: string; name?: string };
      try {
        return json(res, 200, store.addProject(String(body.path ?? ""), body.name, active.id));
      } catch (e) {
        return fail(e);
      }
    }
  }

  // Paired devices may read the settings; only this computer changes them.
  const settings = /^\/api\/projects\/([a-z0-9]{4,16})\/settings$/.exec(path);
  if (settings) {
    if (!store.project(settings[1])) return json(res, 404, { error: "no such project" });
    if (m === "GET") return json(res, 200, store.settings(settings[1]));
    if (m === "POST") {
      if (!local) return json(res, 403, { error: "a project's settings are changed on the computer running Garry" });
      try {
        return json(res, 200, store.saveSettings(settings[1], await readBody(req)));
      } catch (e) {
        return fail(e);
      }
    }
    return json(res, 405, { error: "method not allowed" });
  }

  // Creating the GitHub repository needs a person's yes on this computer.
  const home = /^\/api\/projects\/([a-z0-9]{4,16})\/github-repo$/.exec(path);
  if (home) {
    const p = store.project(home[1]);
    if (!p) return json(res, 404, { error: "no such project" });
    if (m === "GET") return json(res, 200, { remote: remoteOf(p.path), create: await proposeRepo(p, githubToken()) });
    if (m === "POST") {
      if (!local) return json(res, 403, { error: "repositories are created on GitHub from the computer running Garry" });
      if (store.settings(p.id).push === "never") return json(res, 403, { error: "this project never pushes (its settings)" });
      const body = (await readBody(req)) as { owner?: unknown; name?: unknown; private?: unknown };
      try {
        const made = await createRepo(p, githubToken(), {
          owner: typeof body.owner === "string" ? body.owner : undefined,
          name: typeof body.name === "string" ? body.name : undefined,
          private: body.private !== false,
        });
        return json(res, 200, made);
      } catch (e) {
        return fail(e, e instanceof CreateRepoError ? e.status : 400);
      }
    }
    return json(res, 405, { error: "method not allowed" });
  }

  // Hand-editing a project's checkout is this computer only.
  const proj = /^\/api\/projects\/([a-z0-9]{4,16})(\/files|\/file)$/.exec(path);
  if (proj) {
    const p = store.project(proj[1]);
    if (!p) return json(res, 404, { error: "no such project" });
    return fileRoute(req, res, proj[2], p.path, { local, json, readBody });
  }

  if (path === "/api/threads") {
    if (m === "GET") {
      const project = url.searchParams.get("project") ?? undefined;
      const ours = new Set(repos().map((p) => p.id));
      const list = store.threads(project).filter((t) => project || ours.has(t.projectId));
      // Same reading as the menu bar, plus one line on what the agent is doing or asks.
      return (
        json(res, 200, {
          threads: list.map((t) => {
            const running = threads.isRunning(t.id);
            const now = threadState(t, store.events(t.id), running);
            return { ...t, running, attention: now?.state ?? null, activity: now?.detail ?? null };
          }),
        }),
        true
      );
    }
    if (m === "POST") {
      const body = (await readBody(req)) as { projectId?: string; prompt?: string; title?: string };
      try {
        return json(res, 200, threads.create(String(body.projectId ?? ""), String(body.prompt ?? ""), body.title));
      } catch (e) {
        return fail(e);
      }
    }
  }

  const one = /^\/api\/threads\/([a-z0-9]{4,16})(\/[a-z]+)?$/.exec(path);
  if (!one) return false;
  const id = one[1];
  const action = one[2] ?? "";
  const t = store.get(id);
  if (!t) return json(res, 404, { error: "no such thread" });

  try {
    if (m === "GET" && action === "") return json(res, 200, { thread: { ...t, running: threads.isRunning(id) }, events: store.events(id) });
    if (m === "GET" && action === "/events") {
      res.writeHead(200, SSE_HEADERS);
      const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
      for (const e of store.events(id)) send(e);
      const off = threads.subscribe(id, send);
      const ping = setInterval(() => res.write(": ping\n\n"), 20000);
      // the response closes when the viewer goes; the request may close as soon as it was read
      res.on("close", () => {
        off();
        clearInterval(ping);
      });
      return true;
    }
    if (m === "GET" && action === "/diff") return json(res, 200, threads.diff(id));
    if (
      await fileRoute(req, res, action, t.worktree, {
        local,
        json,
        readBody,
        busy: threads.isRunning(id) ? "the agent is still working; stop it or wait before editing" : undefined,
      })
    )
      return true;
    if (m === "POST" && action === "/messages") {
      const body = (await readBody(req)) as { text?: string };
      threads.send(id, String(body.text ?? ""));
      return json(res, 200, { ok: true });
    }
    if (m === "POST" && action === "/stop") return json(res, 200, { stopped: threads.stop(id) });
    if (m === "POST" && action === "/commit") {
      const body = (await readBody(req)) as { message?: string };
      return json(res, 200, threads.commit(id, String(body.message ?? "")));
    }
    if (m === "GET" && action === "/push") return json(res, 200, await threads.pushPreview(id));
    if (m === "POST" && action === "/pr") {
      const body = (await readBody(req)) as {
        title?: string;
        body?: string;
        confirmed?: boolean;
        create?: { owner?: string; name?: string; private?: boolean };
      };
      const create =
        body.create && typeof body.create === "object"
          ? {
              owner: body.create.owner === undefined ? undefined : String(body.create.owner),
              name: body.create.name === undefined ? undefined : String(body.create.name),
              private: body.create.private !== false,
            }
          : undefined;
      return json(res, 200, await threads.openPr(id, body.title, body.body, body.confirmed === true, create));
    }
    if (m === "DELETE" && action === "") {
      if (!local) return json(res, 403, { error: "a thread's work is discarded on the computer running Garry" });
      threads.remove(id);
      return json(res, 200, { ok: true });
    }
  } catch (e) {
    return (
      fail(
        e,
        e instanceof PushError || e instanceof FileSizeError || e instanceof CreateRepoError
          ? e.status
          : /still working|wait for the agent/.test(String(e))
            ? 409
            : 400,
      ),
      true
    );
  }
  return json(res, 405, { error: "method not allowed" });
};
