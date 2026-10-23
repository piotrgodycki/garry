import { existsSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

/**
 * Loads .env.local, then .env, from the current folder once, if present (see
 * .env.example). A variable already set in the environment wins, then .env.local,
 * then .env. Uses the native Node loader. Values are never logged; every
 * variable is optional.
 */
export function loadEnv(root = "."): void {
  if (loaded) return;
  loaded = true;
  for (const name of [".env.local", ".env"]) {
    const file = resolve(root, name);
    if (!existsSync(file) || typeof process.loadEnvFile !== "function") continue;
    try {
      process.loadEnvFile(file);
    } catch {
      // ignore a malformed file; its variables simply stay unset
    }
  }
}

/** Returns the narrow GitHub token, or undefined when it is not configured. */
export function githubToken(root = "."): string | undefined {
  loadEnv(root);
  const t = process.env.GARRY_GITHUB_TOKEN;
  return t && t.trim() ? t.trim() : undefined;
}
