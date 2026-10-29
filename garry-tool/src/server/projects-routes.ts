import type { IncomingMessage, ServerResponse } from "node:http";
import { cloneRepo, forgetToken, githubStatus, listRepos, pollDeviceFlow, saveToken, startDeviceFlow } from "../github/connect.js";
import { githubToken } from "../github/env.js";
import { GarryProjectError, createGarryProject, garryProject, listGarryProjects, removeGarryProject, updateGarryProject, useGarryProject, activeGarryProject } from "../project/store.js";
import { exportGarryProject, importGarryProject, originOf } from "../project/bundle.js";
import { avatarUrl, projectOwner } from "../project/avatar.js";
import { json, readBody, type RouteCtx } from "./http.js";

/**
 * GitHub (connect, list repositories, import one) and Garry projects (switch,
 * export, import, clone what an imported one lists, remove). Returns false
 * when the request is about neither.
 */
export async function projectRoutes(req: IncomingMessage, res: ServerResponse, path: string, ctx: RouteCtx): Promise<boolean | void> {
  const { cfg, local, url } = ctx;
  // GitHub: connect, list repositories, import one as a project. All on this machine only.
  if (path.startsWith("/api/github") || path === "/api/projects/import") {
    if (!local) return json(res, 403, { error: "GitHub is connected on the computer running Garry" });
    try {
      if (req.method === "GET" && path === "/api/github") return json(res, 200, await githubStatus());
      if (req.method === "POST" && path === "/api/github/token") return json(res, 200, await saveToken(String(((await readBody(req)) as { token?: string }).token ?? "")));
      if (req.method === "POST" && path === "/api/github/device") return json(res, 200, await startDeviceFlow());
      if (req.method === "POST" && path === "/api/github/device/poll") return json(res, 200, await pollDeviceFlow(String(((await readBody(req)) as { deviceCode?: string }).deviceCode ?? "")));
      if (req.method === "DELETE" && path === "/api/github") {
        forgetToken();
        return json(res, 200, await githubStatus());
      }
      const token = githubToken();
      if (!token) return json(res, 400, { error: "connect GitHub first" });
      if (req.method === "GET" && path === "/api/github/repos") return json(res, 200, { repos: await listRepos(token, url.searchParams.get("q") ?? "") });
      if (req.method === "POST" && path === "/api/projects/import") {
        const repo = String(((await readBody(req)) as { repo?: string }).repo ?? "");
        const dir = cloneRepo(token, repo);
        return json(res, 200, cfg.threads!.store.addProject(dir, repo.split("/")[1], activeGarryProject().id));
      }
      return json(res, 405, { error: "method not allowed" });
    } catch (e) {
      return json(res, 400, { error: String((e as Error).message ?? e).replace(/AUTHORIZATION: basic \S+/gi, "AUTHORIZATION: ***") });
    }
  }

  // Garry projects: everything one product is made of (the registry and its repositories), switched,
  // exported and imported as one. Reading the list is open to paired devices; the rest is this computer only.
  if (path === "/api/garry-projects" || path.startsWith("/api/garry-projects/")) {
    const list = () => {
      const { active, projects } = listGarryProjects();
      const store = cfg.threads?.store;
      return {
        active,
        registry: cfg.registry,
        projects: projects.map((p) => {
          const repos = store ? store.projectsOf(p.id) : [];
          const owner = projectOwner(
            repos.map((r) => r.path),
            (p.pendingRepos ?? []).map((r) => r.remote),
          );
          return { ...p, repos: repos.map((r) => ({ id: r.id, name: r.name })), ...(owner ? { owner, avatar: avatarUrl(owner) } : {}) };
        }),
      };
    };
    if (req.method === "GET" && path === "/api/garry-projects") return json(res, 200, list());
    if (!local) return json(res, 403, { error: "projects are managed on the computer running Garry" });
    try {
      if (req.method === "POST" && path === "/api/garry-projects") {
        const p = createGarryProject((await readBody(req)) as { name?: unknown; description?: unknown });
        return json(res, 200, p);
      }
      if (req.method === "POST" && path === "/api/garry-projects/active") {
        const p = useGarryProject(String(((await readBody(req)) as { id?: string }).id ?? ""));
        // everything that reads the registry reads the new one from here on
        cfg.registry = p.path;
        return json(res, 200, list());
      }
      if (req.method === "POST" && path === "/api/garry-projects/import") {
        const p = importGarryProject(await readBody(req, 12_000_000));
        return json(res, 200, p);
      }
      const one = /^\/api\/garry-projects\/([a-z0-9-]{1,64})(\/export|\/repos\/clone)?$/.exec(path);
      if (one) {
        const [, id, action] = one;
        if (req.method === "GET" && action === "/export") {
          const store = cfg.threads?.store;
          const repos = store ? store.projectsOf(id).map((r) => ({ name: r.name, remote: originOf(r.path), ...(r.settings ? { settings: r.settings } : {}) })).filter((r) => r.remote) : [];
          const bundle = exportGarryProject(id, repos as { name: string; remote: string }[]);
          res.setHeader("content-disposition", `attachment; filename="${id}.garry.json"`);
          return json(res, 200, bundle);
        }
        if (req.method === "POST" && action === "/repos/clone") {
          const p = garryProject(id);
          if (!p) return json(res, 404, { error: "no such project" });
          const remote = String(((await readBody(req)) as { remote?: string }).remote ?? "");
          const pending = (p.pendingRepos ?? []).find((r) => r.remote === remote);
          if (!pending) return json(res, 404, { error: "that repository is not waiting to be cloned" });
          const slug = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
          if (!slug) return json(res, 400, { error: "only GitHub repositories are cloned from Garry; clone it yourself and add it" });
          const token = githubToken();
          if (!token) return json(res, 400, { error: "connect GitHub first (Settings, GitHub)" });
          const dir = cloneRepo(token, `${slug[1]}/${slug[2]}`);
          const repo = cfg.threads!.store.addProject(dir, pending.name, id);
          if (pending.settings) cfg.threads!.store.saveSettings(repo.id, pending.settings);
          updateGarryProject(id, { pendingRepos: (p.pendingRepos ?? []).filter((r) => r.remote !== remote) });
          return json(res, 200, repo);
        }
        if (req.method === "POST" && !action) return json(res, 200, updateGarryProject(id, (await readBody(req)) as { name?: unknown; description?: unknown }));
        if (req.method === "DELETE" && !action) {
          const store = cfg.threads?.store;
          // agents at work in it are stopped first, by the human
          const busy = store ? store.projectsOf(id).flatMap((r) => store.threads(r.id)).filter((t) => cfg.threads!.isRunning(t.id)) : [];
          if (busy.length) return json(res, 409, { error: `${busy.length} agent${busy.length === 1 ? " is" : "s are"} at work in this project: stop ${busy.length === 1 ? "it" : "them"} first` });
          const now = removeGarryProject(id);
          store?.forgetProjectsOf(id);
          cfg.registry = now.path;
          return json(res, 200, list());
        }
      }
      return json(res, 405, { error: "method not allowed" });
    } catch (e) {
      if (e instanceof GarryProjectError) return json(res, e.status, { error: e.message });
      return json(res, 400, { error: String((e as Error).message ?? e).replace(/AUTHORIZATION: basic \S+/gi, "AUTHORIZATION: ***") });
    }
  }
  return false;
}
