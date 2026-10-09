import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Bundler = "vite" | "webpack" | "rspack" | "unknown";
export type Federation = "module-federation-2" | "module-federation" | "single-spa" | "unknown";

export interface StackDetection {
  framework: string;
  bundler: Bundler;
  federation: Federation;
  configFile?: string;
  evidence: string[];
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function allDeps(pkg: PackageJson): Record<string, string> {
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

/** Finds the first existing file from a list, relative to root. */
function firstExisting(root: string, names: string[]): string | undefined {
  return names.find((n) => existsSync(join(root, n)));
}

/**
 * Detects the stack of an existing repository from its package.json and config
 * files. Heuristic and dependency based, with the evidence recorded so a human
 * can see why Garry decided what it did.
 */
export function detectStack(root: string): StackDetection {
  const evidence: string[] = [];
  const pkgPath = join(root, "package.json");
  const pkg: PackageJson = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf8")) : {};
  const deps = allDeps(pkg);
  const has = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);

  // framework
  let framework = "unknown";
  if (has("react")) framework = "react";
  else if (has("vue")) framework = "vue";
  else if (has("svelte")) framework = "svelte";
  if (framework !== "unknown") evidence.push(`dependency ${framework}`);

  // bundler
  let bundler: Bundler = "unknown";
  const viteCfg = firstExisting(root, ["vite.config.ts", "vite.config.js", "vite.config.mjs"]);
  const webpackCfg = firstExisting(root, ["webpack.config.js", "webpack.config.ts"]);
  const rspackCfg = firstExisting(root, ["rspack.config.js", "rspack.config.ts"]);
  if (has("vite") || viteCfg) {
    bundler = "vite";
    evidence.push(viteCfg ? `found ${viteCfg}` : "dependency vite");
  } else if (has("@rspack/core") || rspackCfg) {
    bundler = "rspack";
    evidence.push(rspackCfg ? `found ${rspackCfg}` : "dependency @rspack/core");
  } else if (has("webpack") || webpackCfg) {
    bundler = "webpack";
    evidence.push(webpackCfg ? `found ${webpackCfg}` : "dependency webpack");
  }

  // federation
  let federation: Federation = "unknown";
  if (has("@module-federation/enhanced") || has("@module-federation/vite")) {
    federation = "module-federation-2";
    evidence.push("dependency @module-federation");
  } else if (has("single-spa") || has("single-spa-react")) {
    federation = "single-spa";
    evidence.push("dependency single-spa");
  }

  const configFile = viteCfg ?? rspackCfg ?? webpackCfg;
  return { framework, bundler, federation, configFile, evidence };
}

/** Lists candidate microfrontend repos under a directory (each with a package.json). */
export function discoverRepos(root: string): string[] {
  if (!existsSync(join(root, "package.json")) && existsSync(root)) {
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "package.json")))
      .map((d) => join(root, d.name));
  }
  return [root];
}
