import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Reading and hand-editing the files of a thread's worktree, for the dashboard
 * on the computer running Garry. Every path stays inside the worktree (no "..",
 * no absolute paths, no symlink out of it) and .git is off limits.
 */

export class FileError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface Entry {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number;
}

export interface FileContent {
  path: string;
  /** null for a binary or too large file, which the editor shows but does not open */
  content: string | null;
  size: number;
  /** sha1 of the bytes on disk; sent back on save so a file the agent changed meanwhile is not overwritten */
  sha: string;
  reason?: "binary" | "too large";
}

export const MAX_EDIT_BYTES = 1_000_000;
const HIDDEN = new Set([".git"]);
const sha1 = (b: Buffer | string) => createHash("sha1").update(b).digest("hex");

/** Resolves a worktree-relative path; throws unless it is inside the worktree and outside .git. */
export function inside(root: string, rel: string): string {
  const clean = (rel ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const full = resolve(root, clean);
  const back = relative(root, full);
  if (back.startsWith("..") || isAbsolute(back)) throw new FileError("path: outside the worktree", 400);
  if (back.split(sep)[0] && HIDDEN.has(back.split(sep)[0])) throw new FileError("path: .git is not editable here", 403);
  // the nearest existing ancestor must not lead out through a symlink
  let probe = full;
  while (!existsSync(probe)) probe = dirname(probe);
  const real = relative(realpathSync(root), realpathSync(probe));
  if (real.startsWith("..") || isAbsolute(real)) throw new FileError("path: outside the worktree", 400);
  return full;
}

/** One directory level, folders first, .git hidden. */
export function listDir(root: string, rel = ""): Entry[] {
  const dir = inside(root, rel);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new FileError(`no folder ${rel || "/"}`, 404);
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => !HIDDEN.has(d.name))
    .map((d): Entry => {
      const path = relative(root, join(dir, d.name)).split(sep).join("/");
      const st = lstatSync(join(dir, d.name));
      return st.isDirectory() ? { name: d.name, path, type: "dir" } : { name: d.name, path, type: "file", size: st.size };
    })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
}

export function readFile(root: string, rel: string): FileContent {
  const full = inside(root, rel);
  if (!existsSync(full) || !statSync(full).isFile()) throw new FileError(`no file ${rel}`, 404);
  const buf = readFileSync(full);
  const base = { path: rel, size: buf.length, sha: sha1(buf) };
  if (buf.length > MAX_EDIT_BYTES) return { ...base, content: null, reason: "too large" };
  if (buf.subarray(0, 8000).includes(0)) return { ...base, content: null, reason: "binary" };
  return { ...base, content: buf.toString("utf8") };
}

/** Writes a text file. With sha, refuses when the file on disk is no longer what the editor loaded. */
export function writeFile(root: string, rel: string, content: string, sha?: string): FileContent {
  if (typeof content !== "string") throw new FileError("content: text", 400);
  if (Buffer.byteLength(content) > MAX_EDIT_BYTES) throw new FileError("content: 1 MB at most", 413);
  const full = inside(root, rel);
  if (existsSync(full)) {
    if (!statSync(full).isFile()) throw new FileError(`${rel} is a folder`, 400);
    if (sha && sha1(readFileSync(full)) !== sha) throw new FileError(`${rel} changed on disk since you opened it; reload it first`, 409);
  } else if (sha) {
    throw new FileError(`${rel} was deleted since you opened it`, 409);
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return readFile(root, rel);
}

/**
 * GET <base>/files?path=, GET <base>/file?path=, POST <base>/file for one root
 * folder (a thread's worktree, a project's checkout, the registry). This
 * computer only; busy, when set, refuses saving with that reason.
 */
export async function fileRoute(
  req: IncomingMessage,
  res: ServerResponse,
  action: string,
  root: string,
  ctx: { local: boolean; json: (res: ServerResponse, code: number, body: unknown) => void; readBody: (req: IncomingMessage) => Promise<unknown>; busy?: string },
): Promise<boolean> {
  if (action !== "/files" && action !== "/file") return false;
  const { json } = ctx;
  if (!ctx.local) return (json(res, 403, { error: "files are opened and edited on the computer running Garry" }), true);
  const m = req.method ?? "GET";
  const rel = new URL(req.url ?? "/", "http://x").searchParams.get("path") ?? "";
  try {
    if (m === "GET" && action === "/files") return (json(res, 200, { path: rel, entries: listDir(root, rel) }), true);
    if (m === "GET" && action === "/file") return (json(res, 200, readFile(root, rel)), true);
    if (m === "POST" && action === "/file") {
      if (ctx.busy) return (json(res, 409, { error: ctx.busy }), true);
      const body = (await ctx.readBody(req)) as { path?: string; content?: string; sha?: string };
      return (json(res, 200, writeFile(root, String(body.path ?? ""), body.content as string, body.sha)), true);
    }
  } catch (e) {
    if (e instanceof FileError) return (json(res, e.status, { error: e.message }), true);
    throw e;
  }
  return (json(res, 405, { error: "method not allowed" }), true);
}
