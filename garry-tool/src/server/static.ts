import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".map": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// The UI holds no secrets, but it should not be framed, sniffed or leak the
// pairing code in /pair?code=... through a Referer header.
const HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

/**
 * Serves the built dashboard (garry-ui/dist) from garry serve: a file when the
 * path names one inside the folder, index.html for every other page (client side
 * routes). Returns false when there is no UI folder, so the caller can answer.
 */
export function serveUi(req: IncomingMessage, res: ServerResponse, uiDir: string | undefined, path: string): boolean {
  if (!uiDir || !existsSync(join(uiDir, "index.html"))) return false;
  const root = resolve(uiDir);
  let file = resolve(root, `.${decodeURIComponent(path)}`);
  // never outside the folder (../), and folders fall back to the app
  if ((file !== root && !file.startsWith(root + sep)) || !existsSync(file) || !statSync(file).isFile()) {
    file = join(root, "index.html");
  }
  const hashed = file.startsWith(join(root, "assets") + sep);
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    ...HEADERS,
  });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
  return true;
}
