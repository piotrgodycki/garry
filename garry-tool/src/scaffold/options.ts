import { defaultRegistry } from "../paths.js";
export type ServiceKind = "shell" | "remote";

export interface ScaffoldOptions {
  name: string;
  kind: ServiceKind;
  framework: string;
  bundler: string;
  federation: string;
  owner: string;
  registry: string;
  out: string;
}

export interface ParsedArgs {
  values: Partial<ScaffoldOptions>;
  help: boolean;
  yes: boolean;
}

const FLAGS = [
  "name",
  "kind",
  "framework",
  "bundler",
  "federation",
  "owner",
  "registry",
  "out",
] as const;

/** Minimal flag parser. Supports a leading positional name and --key value flags. */
export function parseArgs(argv: string[]): ParsedArgs {
  const values: Partial<ScaffoldOptions> = {};
  let help = false;
  let yes = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      help = true;
      continue;
    }
    if (a === "--yes" || a === "-y") {
      yes = true;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if ((FLAGS as readonly string[]).includes(key) && val !== undefined && !val.startsWith("--")) {
        (values as Record<string, string>)[key] = val;
        i++;
      }
      continue;
    }
    if (!values.name) values.name = a;
  }

  return { values, help, yes };
}

const DEFAULTS = {
  framework: "react",
  bundler: "vite",
  federation: "module-federation-2",
  owner: "team-unknown",
};

/** Fills the optional fields with sensible defaults, keeping any provided values. */
export function applyDefaults(v: Partial<ScaffoldOptions>): Partial<ScaffoldOptions> {
  return { ...DEFAULTS, registry: v.registry ?? defaultRegistry(), ...v };
}

/** Builds the human readable stack string from the structured fields. */
export function stackString(o: Pick<ScaffoldOptions, "framework" | "bundler" | "federation">): string {
  return `${o.framework} + ${o.bundler} + ${o.federation}`;
}
