import { existsSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

/**
 * Loads .env from the repo root once, if present. Uses the native Node loader.
 * The token is never logged. Absence is fine: GitHub features degrade gracefully.
 */
export function loadEnv(root = "."): void {
  if (loaded) return;
  loaded = true;
  const file = resolve(root, ".env");
  if (existsSync(file) && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(file);
    } catch {
      // ignore a malformed .env; the token simply stays unset
    }
  }
}

/** Returns the narrow GitHub token, or undefined when it is not configured. */
export function githubToken(root = "."): string | undefined {
  loadEnv(root);
  const t = process.env.GARRY_GITHUB_TOKEN;
  return t && t.trim() ? t.trim() : undefined;
}
