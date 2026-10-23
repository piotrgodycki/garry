import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  ServiceManifestSchema,
  RemotesContractSchema,
  SharedDepsContractSchema,
  DesignTokensContractSchema,
  EventsContractSchema,
  ApiContractSchema,
  type ServiceManifest,
  type ApiContract,
} from "./schema.js";
import type { ZodSchema } from "zod";

export interface ValidationIssue {
  level: "error" | "warn";
  where: string;
  message: string;
}

/**
 * Validates a registry directory:
 *  1. the schema of every manifest and contract (zod),
 *  2. cross service consistency (consumes, exposes, remotes, events).
 * This is the reference implementation behind the contract-validate skill.
 */
export function validateRegistry(root: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (where: string, message: string) =>
    issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) =>
    issues.push({ level: "warn", where, message });

  const zodMsg = (e: { issues: { path: PropertyKey[]; message: string }[] }) =>
    e.issues.map((i) => `${i.path.map(String).join(".") || "<root>"}: ${i.message}`).join("; ");

  // catalog/
  const services: Record<string, ServiceManifest> = {};
  const catalogDir = join(root, "catalog");
  if (!existsSync(catalogDir)) {
    err("catalog", "the catalog/ directory is missing");
  } else {
    for (const f of readdirSync(catalogDir).filter((f) => /\.ya?ml$/.test(f))) {
      let raw: unknown;
      try {
        raw = parseYaml(readFileSync(join(catalogDir, f), "utf8"));
      } catch (e) {
        err(`catalog/${f}`, `invalid YAML: ${(e as Error).message}`);
        continue;
      }
      const r = ServiceManifestSchema.safeParse(raw);
      if (!r.success) {
        err(`catalog/${f}`, zodMsg(r.error));
        continue;
      }
      services[r.data.name] = r.data;
      const stem = basename(f).replace(/\.ya?ml$/, "");
      if (r.data.name !== stem)
        warn(`catalog/${f}`, `file name (${stem}) does not match name (${r.data.name})`);
    }
  }

  // contracts/
  const contractsDir = join(root, "contracts");
  const loadJson = <T>(name: string, schema: ZodSchema<T>): T | null => {
    const p = join(contractsDir, name);
    if (!existsSync(p)) {
      warn(`contracts/${name}`, "contract file is missing");
      return null;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(p, "utf8"));
    } catch (e) {
      err(`contracts/${name}`, `invalid JSON: ${(e as Error).message}`);
      return null;
    }
    const r = schema.safeParse(raw);
    if (!r.success) {
      err(`contracts/${name}`, zodMsg(r.error));
      return null;
    }
    return r.data;
  };

  const remotes = loadJson("remotes.json", RemotesContractSchema);
  loadJson("shared-deps.json", SharedDepsContractSchema);
  loadJson("design-tokens.json", DesignTokensContractSchema);
  const events = loadJson("events.json", EventsContractSchema);

  // api.json is optional (only backend registries have it). Validate it if present.
  let api: ApiContract | null = null;
  const apiPath = join(contractsDir, "api.json");
  if (existsSync(apiPath)) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(apiPath, "utf8"));
      const r = ApiContractSchema.safeParse(raw);
      if (!r.success) err("contracts/api.json", zodMsg(r.error));
      else api = r.data;
    } catch (e) {
      err("contracts/api.json", `invalid JSON: ${(e as Error).message}`);
    }
  }

  // cross service consistency
  for (const [name, svc] of Object.entries(services)) {
    for (const [dep, modules] of Object.entries(svc.consumes)) {
      const target = services[dep];
      if (!target) {
        err(`catalog/${name}`, `consumes references an unknown service: ${dep}`);
        continue;
      }
      for (const m of modules) {
        if (!target.exposes.includes(m))
          err(`catalog/${name}`, `consumes ${dep}:${m}, but ${dep} does not expose it`);
      }
    }
  }

  if (remotes) {
    for (const [rname, r] of Object.entries(remotes)) {
      const svc = services[rname];
      if (!svc) {
        warn("contracts/remotes.json", `remote ${rname} has no manifest in catalog/`);
        continue;
      }
      for (const e of r.exposes) {
        if (!svc.exposes.includes(e))
          err(
            "contracts/remotes.json",
            `remote ${rname} declares expose ${e}, missing in catalog/${rname}`,
          );
      }
    }
  }

  if (events) {
    for (const [ename, ev] of Object.entries(events)) {
      for (const p of [...ev.producers, ...ev.consumers]) {
        if (!services[p])
          warn("contracts/events.json", `event ${ename} references an unknown service ${p}`);
      }
    }
  }

  // Backend API contract: a declared api service should have a manifest, and a
  // service that consumes an api target should consume a service that declares one.
  if (api) {
    for (const svc of Object.keys(api)) {
      if (!services[svc]) warn("contracts/api.json", `api declares unknown service ${svc}`);
    }
    for (const [name, svc] of Object.entries(services)) {
      if (svc.api && !api[name])
        warn(`catalog/${name}`, `manifest declares an api but contracts/api.json has no entry for ${name}`);
    }
  }

  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}
