import type { IncomingMessage, ServerResponse } from "node:http";
import type { ThreadManager } from "../threads/manager.js";
import { activeGarryProject } from "../project/store.js";
import { TeamError, type Teams } from "./teams.js";

/**
 * Agents working together (garry/teams.ts), for the active project:
 * GET /api/teams (pairs and chains), POST /api/pairs {task, projectId?, rounds?},
 * POST /api/chains {steps, name?, projectId?, after?}, POST /api/chains/:id/steps {prompt},
 * POST /api/chains/:id/order {order}, DELETE /api/chains/:id/steps/:step, POST /api/chains/:id/stop.
 * This machine and paired devices.
 */
export async function teamRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  ctx: { teams: Teams; threads: ThreadManager; json: (res: ServerResponse, code: number, body: unknown) => void; readBody: (req: IncomingMessage) => Promise<unknown> },
): Promise<boolean | void> {
  const { teams, threads, json } = ctx;
  const repos = () => threads.store.projectsOf(activeGarryProject().id).map((r) => r.id);
  const inProject = (projectId: string) => repos().includes(projectId);
  const repoOf = (given?: string) => {
    const id = given || repos()[0];
    if (!id) throw new TeamError("add a repository to this project first (Build)");
    if (!inProject(id)) throw new TeamError("that repository is not in this project");
    return id;
  };
  const m = req.method ?? "GET";
  try {
    if (m === "GET" && path === "/api/teams") return json(res, 200, { pairs: teams.pairs().filter((p) => inProject(p.projectId)), chains: teams.chains().filter((c) => inProject(c.projectId)) });
    if (m === "POST" && path === "/api/pairs") {
      const b = (await ctx.readBody(req)) as { task?: string; projectId?: string; rounds?: number };
      return json(res, 200, teams.startPair(repoOf(b.projectId), String(b.task ?? ""), b.rounds === undefined ? 3 : Number(b.rounds)));
    }
    if (m === "POST" && path === "/api/chains") {
      const b = (await ctx.readBody(req)) as { steps?: unknown; name?: string; projectId?: string; after?: string };
      const steps = Array.isArray(b.steps) ? b.steps.map(String) : [];
      return json(res, 200, teams.startChain(repoOf(b.projectId), steps, String(b.name ?? ""), b.after ? String(b.after) : undefined));
    }
    const one = /^\/api\/chains\/([a-z0-9]{4,16})(\/steps|\/order|\/stop|\/steps\/([a-z0-9]{4,16}))$/.exec(path);
    if (one) {
      const [, id, action, step] = one;
      if (!teams.chains().some((c) => c.id === id && inProject(c.projectId))) return json(res, 404, { error: "no such chain" });
      if (m === "POST" && action === "/steps") return json(res, 200, teams.addStep(id, String(((await ctx.readBody(req)) as { prompt?: string }).prompt ?? "")));
      if (m === "POST" && action === "/order") {
        const order = ((await ctx.readBody(req)) as { order?: unknown }).order;
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
}
