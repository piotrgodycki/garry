import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { tokenWithSource } from "./connect.js";

let loaded = false;

/**
 * Loads .env.local, then .env, once. Variables already in the environment win.
 * Values are never logged.
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

/**
 * GARRY_GITHUB_TOKEN, else the token saved when you connected in Garry, else the
 * GitHub CLI's sign in.
 */
export function githubToken(root = "."): string | undefined {
  loadEnv(root);
  return tokenWithSource()?.token;
}
