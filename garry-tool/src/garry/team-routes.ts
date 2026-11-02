import { TeamError } from "./teams.js";
import type { RouteGroup } from "../server/context.js";
import { json, readBody } from "../server/http.js";

/**
 * Routes for pairs and chains (garry/teams.ts) in the active project, open to
 * this machine and paired devices.
 */
export const teamRoutes: RouteGroup = async (req, res, path, { services: { teams }, repos: projectRepos }) => {
  if (!/^\/api\/(teams|pairs|chains)(\/|$)/.test(path)) return false;
  const repos = () => projectRepos().map((r) => r.id);
  const inProject = (projectId: string) => repos().includes(projectId);
  const repoOf = (given?: string) => {
    const id = given || repos()[0];
    if (!id) throw new TeamError("add a repository to this project first (Build)");
    if (!inProject(id)) throw new TeamError("that repository is not in this project");
    return id;
  };
  const m = req.method ?? "GET";
  try {
    if (m === "GET" && path === "/api/teams")
      return json(res, 200, { pairs: teams.pairs().filter((p) => inProject(p.projectId)), chains: teams.chains().filter((c) => inProject(c.projectId)) });
    if (m === "POST" && path === "/api/pairs") {
      const b = (await readBody(req)) as { task?: string; projectId?: string; rounds?: number };
      return json(res, 200, teams.startPair(repoOf(b.projectId), String(b.task ?? ""), b.rounds === undefined ? 3 : Number(b.rounds)));
    }
    if (m === "POST" && path === "/api/chains") {
      const b = (await readBody(req)) as { steps?: unknown; name?: string; projectId?: string; after?: string };
      const steps = Array.isArray(b.steps) ? b.steps.map(String) : [];
      return json(res, 200, teams.startChain(repoOf(b.projectId), steps, String(b.name ?? ""), b.after ? String(b.after) : undefined));
    }
    const one = /^\/api\/chains\/([a-z0-9]{4,16})(\/steps|\/order|\/stop|\/steps\/([a-z0-9]{4,16}))$/.exec(path);
    if (one) {
      const [, id, action, step] = one;
      if (!teams.chains().some((c) => c.id === id && inProject(c.projectId))) return json(res, 404, { error: "no such chain" });
      if (m === "POST" && action === "/steps") return json(res, 200, teams.addStep(id, String(((await readBody(req)) as { prompt?: string }).prompt ?? "")));
      if (m === "POST" && action === "/order") {
        const order = ((await readBody(req)) as { order?: unknown }).order;
        return json(res, 200, teams.reorder(id, Array.isArray(order) ? order.map(String) : []));
      }
      if (m === "POST" && action === "/stop") return json(res, 200, teams.stopChain(id));
      if (m === "DELETE" && step) return json(res, 200, teams.dropStep(id, step));
      return json(res, 405, { error: "method not allowed" });
    }
  } catch (e) {
    if (e instanceof TeamError) return json(res, e.status, { error: e.message });
    return json(res, 400, { error: String((e as Error).message ?? e) });
  }
  return false;
};
