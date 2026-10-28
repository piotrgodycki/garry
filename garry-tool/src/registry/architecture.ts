import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ArchitectureSchema, checkArchitecture, serviceBlock, type Architecture, type ArchitectureIssue, type Component } from "./schema/architecture.js";
import { listManifests } from "../sync/registryIO.js";

/**
 * The registry's architecture boards: one for the whole project
 * (architecture.json) and one per repository (architecture/<repo>.json). Used
 * by the Architecture page and garry architecture.
 */

export class ArchitectureError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A board is named after its repository; "" is the whole project's. */
export const BOARD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const file = (registry: string, board = "") => {
  if (!board) return join(registry, "architecture.json");
  if (!BOARD_NAME.test(board) || board.includes("..")) throw new ArchitectureError(`board: not a repository name: ${board}`, 400);
  return join(registry, "architecture", `${board}.json`);
};
const services = (registry: string) => listManifests(registry).map((m) => ({ name: m.name, kind: m.kind as string | undefined, db: m.db }));

export function readArchitecture(registry: string, board = ""): Architecture {
  const f = file(registry, board);
  if (!existsSync(f)) return { nodes: [], edges: [] };
  try {
    const r = ArchitectureSchema.safeParse(JSON.parse(readFileSync(f, "utf8")));
    return r.success ? r.data : { nodes: [], edges: [] };
  } catch {
    return { nodes: [], edges: [] };
  }
}

/** The board, the registry's services as blocks, and what the check says. */
export function architectureState(registry: string, board = ""): { architecture: Architecture; services: Component[]; issues: ArchitectureIssue[] } {
  const architecture = readArchitecture(registry, board);
  const svc = services(registry);
  return { architecture, services: svc.map(serviceBlock), issues: checkArchitecture(architecture, svc) };
}

export function checkDraft(registry: string, input: unknown): ArchitectureIssue[] {
  const r = ArchitectureSchema.safeParse(input);
  if (!r.success) throw new ArchitectureError(r.error.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join("; "), 400);
  return checkArchitecture(r.data, services(registry));
}

/**
 * Writes the board. Links to blocks that are not on the board are dropped, and
 * so are repeated links. The wizard's answers are kept unless the input sets
 * them (null clears them), so editing the board by hand does not lose them.
 */
export function saveArchitecture(registry: string, input: unknown, board = ""): { architecture: Architecture; issues: ArchitectureIssue[] } {
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
  const wizard = r.data.wizard === undefined ? readArchitecture(registry, board).wizard : r.data.wizard;
  const architecture: Architecture = { nodes: r.data.nodes.map((n) => ({ ...n, x: Math.round(n.x), y: Math.round(n.y) })), edges, ...(wizard ? { wizard } : {}) };
  const f = file(registry, board);
  mkdirSync(join(f, ".."), { recursive: true });
  writeFileSync(f, JSON.stringify(architecture, null, 2) + "\n");
  return { architecture, issues: checkArchitecture(architecture, services(registry)) };
}

/** Empties a board: its blocks, links and wizard answers. Another board is untouched. */
export function resetArchitecture(registry: string, board = ""): void {
  rmSync(file(registry, board), { force: true });
}

/** The boards there are: the whole project's, and one per repository named. */
export function listBoards(registry: string, repos: string[]): { id: string; name: string; blocks: number }[] {
  const names = [...new Set(repos.filter((r) => BOARD_NAME.test(r) && !r.includes("..")))];
  return [{ id: "", name: "Whole project" }, ...names.map((n) => ({ id: n, name: n }))].map((b) => ({ ...b, blocks: readArchitecture(registry, b.id).nodes.length }));
}
