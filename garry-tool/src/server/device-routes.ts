import type { IncomingMessage, ServerResponse } from "node:http";
import { pushEnabled } from "../status/push.js";
import { DEVICE_COOKIE, type DeviceStore } from "./auth.js";
import type { RouteGroup } from "./context.js";
import { json, readBody, writeAllowed } from "./http.js";

/**
 * The only endpoint another device may call without a token. Browsers get an HttpOnly
 * cookie; the apps keep the token and send it as a bearer header.
 */
export async function pairRoute(req: IncomingMessage, res: ServerResponse, devices: DeviceStore): Promise<void> {
  const body = (await readBody(req)) as { code?: string; name?: string; session?: string };
  if (typeof body.code !== "string" || !body.code) return json(res, 400, { error: "code is required" });
  const r = devices.pair(body.code, typeof body.name === "string" ? body.name : "");
  if ("error" in r) return json(res, r.status, { error: r.error });
  if (body.session === "cookie") {
    res.setHeader("set-cookie", `${DEVICE_COOKIE}=${r.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`);
    return json(res, 200, { device: r.device });
  }
  json(res, 200, r);
}

export const deviceRoutes: RouteGroup = async (req, res, path, { local, device, services: { devices } }) => {
  if (path === "/api/push/token") {
    if (!device) return json(res, 400, { error: "only a paired device registers for notifications" });
    if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
    const body = (await readBody(req)) as { token?: string | null };
    try {
      devices.setPushToken(device.id, body.token ? String(body.token) : null);
      return json(res, 200, { ok: true, notifications: Boolean(body.token), enabled: pushEnabled() });
    } catch (e) {
      return json(res, 400, { error: String((e as Error).message ?? e) });
    }
  }

  if (path !== "/api/pair/codes" && !path.startsWith("/api/devices")) return false;
  // managed on this computer only, so a stolen token cannot mint more
  if (!local || !writeAllowed(req)) return json(res, 403, { error: "devices are managed on the computer running Garry" });
  if (req.method === "POST" && path === "/api/pair/codes") return json(res, 200, devices.createCode());
  if (req.method === "GET" && path === "/api/devices") return json(res, 200, { devices: devices.list().map(({ tokenHash: _, ...d }) => d) });
  const del = /^\/api\/devices\/([^/]+)$/.exec(path);
  if (req.method === "DELETE" && del) {
    return devices.revoke(decodeURIComponent(del[1])) ? json(res, 200, { ok: true }) : json(res, 404, { error: "no such device" });
  }
  json(res, 404, { error: "not found", path });
};
