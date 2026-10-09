import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface MfConfig {
  name?: string;
  exposes: string[];
  remotes: string[];
  shared: string[];
}

/**
 * Extracts the Module Federation surface from a bundler config by static text
 * parsing. It never evaluates the config (untrusted code). It reads the exposes,
 * remotes and shared keys well enough to seed the registry, and a human approves
 * the result afterwards.
 */
export function extractMf(root: string, configFile: string | undefined): MfConfig {
  const result: MfConfig = { exposes: [], remotes: [], shared: [] };
  if (!configFile) return result;
  const p = join(root, configFile);
  if (!existsSync(p)) return result;
  const src = readFileSync(p, "utf8");

  const name = /name:\s*["'`]([^"'`]+)["'`]/.exec(src);
  if (name) result.name = name[1];

  result.exposes = objectKeys(block(src, "exposes"));
  result.remotes = objectKeys(block(src, "remotes"));
  result.shared = sharedNames(src);

  return result;
}

/** Returns the text inside the first `key: { ... }` balanced braces, or empty. */
function block(src: string, key: string): string {
  const start = new RegExp(`${key}\\s*:\\s*\\{`).exec(src);
  if (!start) return "";
  let i = start.index + start[0].length;
  let depth = 1;
  const from = i;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
  }
  return src.slice(from, i - 1);
}

/** Collects the string keys of an object literal body, for example "./App": ... */
function objectKeys(body: string): string[] {
  const keys: string[] = [];
  const re = /["'`]([^"'`]+)["'`]\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) keys.push(m[1]);
  return keys;
}

/** shared can be an array of names or an object keyed by name. Handles both. */
function sharedNames(src: string): string[] {
  const arr = /shared\s*:\s*\[([^\]]*)\]/.exec(src);
  if (arr) {
    return [...arr[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  }
  return objectKeys(block(src, "shared"));
}
