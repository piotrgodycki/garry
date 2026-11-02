import { MODELS } from "../orchestrate/models.js";
import { SERVICE_KINDS } from "../registry/schema/kinds.js";
import { liveView } from "../status/live.js";
import { garryStatus } from "../status/status.js";
import type { RouteCtx, RouteGroup } from "./context.js";
import { ENDPOINTS } from "./endpoints.js";
import { json } from "./http.js";

const MAX_HOURS = 24 * 14;

const projectThreadIds = ({ services: { threads }, repos }: RouteCtx) => {
  const ours = new Set(repos().map((r) => r.id));
  return new Set(
    threads.store
      .threads()
      .filter((t) => ours.has(t.projectId))
      .map((t) => t.id),
  );
};

/** Read-only views: Garry at a glance, the live board, and what the server knows. */
export const statusRoutes: RouteGroup = async (req, res, path, ctx) => {
  if (req.method !== "GET") return false;
  switch (path) {
    case "/api/status":
      return json(res, 200, garryStatus(ctx.services.threads, projectThreadIds(ctx)));
    case "/api/live": {
      const hours = Math.min(Math.max(Number(ctx.url.searchParams.get("hours")) || 24, 1), MAX_HOURS);
      return json(res, 200, liveView(ctx.services.threads, projectThreadIds(ctx), new Date(Date.now() - hours * 3_600_000)));
    }
    case "/":
    case "/health":
      return json(res, 200, { ok: true, service: "garry-server", endpoints: ENDPOINTS });
    case "/api/models":
      return json(res, 200, { models: MODELS });
    case "/api/service-kinds":
      return json(res, 200, { kinds: SERVICE_KINDS });
    default:
      return false;
  }
};
