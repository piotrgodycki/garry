import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { tokenWithSource } from "./connect.js";

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

/**
 * The GitHub token: GARRY_GITHUB_TOKEN, else the one saved when you connected
 * in Garry, else the GitHub CLI's sign in. Undefined when there is none.
 */
export function githubToken(root = "."): string | undefined {
  loadEnv(root);
  return tokenWithSource()?.token;
}
