import { execFileSync } from "node:child_process";

/** Runs git and returns trimmed stdout. Throws on a non zero exit. */
export function git(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .toString()
    .trim();
}

/** Runs git without throwing. Returns ok and the output or error text. */
export function gitTry(args: string[], cwd?: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: git(args, cwd) };
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return { ok: false, out: String(err.stderr ?? err.message ?? e).trim() };
  }
}
