import type { IncomingMessage, ServerResponse } from "node:http";
import { hostAllowed, isLoopback, requestToken, type Device, type DeviceStore } from "./auth.js";
import { json, writeAllowed } from "./http.js";

export interface Caller {
  local: boolean;
  device: Device | null;
}

/**
 * Who is asking, or null once the request has been refused. A page that rebinds its own
 * domain to 127.0.0.1 would otherwise pass as this computer, so only the names this server
 * is reached by are answered. A device is known only by a paired token.
 */
export function admit(req: IncomingMessage, res: ServerResponse, url: URL, hosts: string[], devices: DeviceStore): Caller | null {
  if (!hostAllowed(req, hosts)) {
    json(res, 403, { error: `unknown host ${req.headers.host}; add it with --host` });
    return null;
  }
  const local = isLoopback(req);
  const presented = local ? null : requestToken(req, url);
  return { local, device: presented ? devices.verify(presented) : null };
}

/**
 * Browsers never send a bearer token on their own, so an app's writes need no origin check.
 * This computer and paired browsers (cookie) do: another site open in the same browser must not write.
 */
export function writeRefused(req: IncomingMessage, res: ServerResponse, caller: Caller): boolean {
  const bearer = Boolean(caller.device && req.headers.authorization?.startsWith("Bearer "));
  if ((req.method !== "POST" && req.method !== "DELETE") || bearer || writeAllowed(req)) return false;
  json(res, 403, { error: `writes are not allowed from ${req.headers.origin}; add it to GARRY_UI_ORIGINS` });
  return true;
}
