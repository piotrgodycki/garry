import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { ServiceManifestSchema, type ServiceManifest } from "./schema/schema.js";
import { validateRegistry, type ValidationIssue } from "./schema/validate.js";
import { listManifests } from "../sync/registryIO.js";
import { readStack } from "./stacks.js";
import { stackLine } from "./schema/stacks.js";
import { SERVICE_KIND_IDS, isServiceKind, kindInfo } from "./schema/kinds.js";

/**
 * Adds services to the registry and removes them: one manifest per service in
 * catalog/<name>.yaml, the same file garry scaffold and garry adopt write. Used by
 * garry service and by the dashboard.
 */

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type { ServiceKind } from "./schema/kinds.js";
export { SERVICE_KINDS } from "./schema/kinds.js";

export interface ServiceInput {
  name?: string;
  kind?: string;
  repo?: string;
  owner?: string;
  stack?: string;
  /** a stack from stacks/; fills stack when that is left empty */
  stackRef?: string;
  exposes?: string[];
  /** service name to the modules (or endpoints) it uses from that service */
  consumes?: Record<string, string[]>;
  /** the database it owns, for kinds that may own one (API, worker, server-rendered app...) */
  db?: { engine: string; name?: string; migrations?: string } | null;
}

const NAME = /^[a-z][a-z0-9-]{0,62}$/;

const file = (registry: string, name: string) => join(registry, "catalog", `${name}.yaml`);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

/** Writes catalog/<name>.yaml. Refuses a name that exists unless replace is set. Returns the manifest and what the registry check says now. */
export function addService(
  registry: string,
  input: ServiceInput,
  opts: { replace?: boolean } = {},
): { service: ServiceManifest; file: string; issues: ValidationIssue[] } {
  const name = (input.name ?? "").trim();
  if (!NAME.test(name)) throw new ServiceError("name: lowercase letters, digits and dashes, starting with a letter", 400);
  const kind = input.kind ?? "";
  if (!isServiceKind(kind)) throw new ServiceError(`kind: one of ${SERVICE_KIND_IDS.join(", ")}`, 400);
  const info = kindInfo(kind);
  const repo = (input.repo ?? "").trim();
  if (!repo) throw new ServiceError("repo: the git URL (or path) of the service's repository", 400);
  if (existsSync(file(registry, name)) && !opts.replace) throw new ServiceError(`service ${name} already exists`, 409);

  const others = new Map(listManifests(registry).filter((m) => m.name !== name).map((m) => [m.name, m]));
  const consumes: Record<string, string[]> = {};
  for (const [dep, modules] of Object.entries(input.consumes ?? {})) {
    const target = others.get(dep);
    if (!target) throw new ServiceError(`consumes: there is no service ${dep}`, 400);
    const missing = list(modules).filter((m) => !target.exposes.includes(m));
    if (missing.length) throw new ServiceError(`consumes: ${dep} does not expose ${missing.join(", ")}`, 400);
    consumes[dep] = list(modules);
  }

  const stackRef = input.stackRef?.trim() || undefined;
  const linked = stackRef ? readStack(registry, stackRef) : null;
  if (stackRef && !linked) throw new ServiceError(`stackRef: there is no stack ${stackRef}`, 400);

  const parsed = ServiceManifestSchema.safeParse({
    name,
    repo,
    stack: input.stack?.trim() || (linked ? stackLine(linked) : info.stack),
    stackRef,
    kind,
    owner: input.owner?.trim() || "unassigned",
    exposes: info.exposes ? list(input.exposes) : [],
    consumes,
    db: info.db ? (input.db ?? null) : null,
  });
  if (!parsed.success) throw new ServiceError(parsed.error.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join("; "), 400);

  mkdirSync(join(registry, "catalog"), { recursive: true });
  writeFileSync(file(registry, name), stringifyYaml(parsed.data));
  // a fresh registry has no contracts yet; that is not this service's problem
  const issues = validateRegistry(registry).filter((i) => i.message !== "contract file is missing");
  return { service: parsed.data, file: file(registry, name), issues };
}

/** Deletes catalog/<name>.yaml. Refuses while another service consumes it. */
export function removeService(registry: string, name: string): void {
  if (!NAME.test(name) || !existsSync(file(registry, name))) throw new ServiceError(`no service ${name}`, 404);
  const users = listManifests(registry).filter((m) => m.name !== name && name in (m.consumes ?? {}));
  if (users.length) throw new ServiceError(`${users.map((u) => u.name).join(", ")} ${users.length > 1 ? "use" : "uses"} ${name}; take it out of their consumes first`, 409);
  unlinkSync(file(registry, name));
}
