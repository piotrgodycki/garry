import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { loadEnv } from "../github/env.js";

/**
 * Access control for the Garry server. Without GARRY_ACCESS_TOKEN the server only
 * listens on loopback, so only this machine can reach it. With a token every /api
 * request must carry it, either as "Authorization: Bearer <token>" or, for
 * EventSource which cannot set headers, as the access_token query parameter.
 */

/** The configured access token, or undefined. Read from the environment or .env. */
export function accessToken(root = "."): string | undefined {
  loadEnv(root);
  const t = process.env.GARRY_ACCESS_TOKEN;
  return t && t.trim() ? t.trim() : undefined;
}

/** Tokens shorter than this are refused, so a guessable token is never exposed. */
export const MIN_TOKEN_LENGTH = 24;

export function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True when the request carries the expected token (or no token is configured). */
export function authorized(req: IncomingMessage, url: URL, token: string | undefined): boolean {
  if (!token) return true;
  const header = req.headers.authorization ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (bearer && same(bearer, token)) return true;
  const query = url.searchParams.get("access_token");
  return Boolean(query && same(query, token));
}
