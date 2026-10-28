import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ArchitectureSchema, checkArchitecture, serviceBlock, type Architecture, type ArchitectureIssue, type Component } from "./schema/architecture.js";
import { listManifests } from "../sync/registryIO.js";

/** The registry's architecture board, architecture.json. Used by the Architecture page and garry architecture. */

export class ArchitectureError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const file = (registry: string) => join(registry, "architecture.json");
const services = (registry: string) => listManifests(registry).map((m) => ({ name: m.name, kind: m.kind as string | undefined, db: m.db }));

export function readArchitecture(registry: string): Architecture {
  if (!existsSync(file(registry))) return { nodes: [], edges: [] };
  const r = ArchitectureSchema.safeParse(JSON.parse(readFileSync(file(registry), "utf8")));
  return r.success ? r.data : { nodes: [], edges: [] };
}

/** The board, the registry's services as blocks, and what the check says. */
export function architectureState(registry: string): { architecture: Architecture; services: Component[]; issues: ArchitectureIssue[] } {
  const architecture = readArchitecture(registry);
  const svc = services(registry);
  return { architecture, services: svc.map(serviceBlock), issues: checkArchitecture(architecture, svc) };
}

export function checkDraft(registry: string, input: unknown): ArchitectureIssue[] {
  const r = ArchitectureSchema.safeParse(input);
  if (!r.success) throw new ArchitectureError(r.error.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join("; "), 400);
  return checkArchitecture(r.data, services(registry));
}

/** Writes architecture.json. Links to blocks that are not on the board are dropped, and so are repeated links. */
export function saveArchitecture(registry: string, input: unknown): { architecture: Architecture; issues: ArchitectureIssue[] } {
  const r = ArchitectureSchema.safeParse(input);
  if (!r.success) throw new ArchitectureError(r.error.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join("; "), 400);
  const ids = new Set(r.data.nodes.map((n) => n.id));
  if (ids.size !== r.data.nodes.length) throw new ArchitectureError("nodes: every block needs its own id", 400);
  const seen = new Set<string>();
  const edges = r.data.edges.filter((e) => {
    const key = `${e.from}>${e.to}:${e.capability}`;
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const architecture = { nodes: r.data.nodes.map((n) => ({ ...n, x: Math.round(n.x), y: Math.round(n.y) })), edges };
  writeFileSync(file(registry), JSON.stringify(architecture, null, 2) + "\n");
  return { architecture, issues: checkArchitecture(architecture, services(registry)) };
}
