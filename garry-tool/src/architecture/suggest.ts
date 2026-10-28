import { spawn } from "node:child_process";
import { CAPABILITIES, COMPONENTS, checkArchitecture, componentById, serviceBlock, type Architecture, type ArchitectureIssue, type Capability } from "../registry/schema/architecture.js";

/**
 * Suggestions for the architecture board. Quick fixes come from the rules and
 * need no AI: for every open need, the blocks that would satisfy it, best fits
 * first. Garry's suggestions ask Claude Code (the claude command, on your own
 * Claude plan, no API key) to look at the board and a goal in plain words.
 */

export interface Suggestion {
  title: string;
  why: string;
  /** blocks to add; refer to them in links as "new:<index>" */
  add: { block: string; label?: string }[];
  /** links between existing node ids and new:<index> */
  links: { from: string; to: string; capability: Capability }[];
}

type Service = { name: string; kind?: string; db?: unknown };

const blockOf = (id: string, services: Service[]) => componentById(id) ?? services.map(serviceBlock).find((b) => b.id === id);

/** For each open need on the board: add a block that provides it and link it. */
export function quickFixes(arch: Architecture, services: Service[]): Suggestion[] {
  const out: Suggestion[] = [];
  for (const n of arch.nodes) {
    const b = blockOf(n.block, services);
    if (!b) continue;
    const linked = new Set(arch.edges.filter((e) => e.from === n.id).map((e) => e.capability));
    // the platform this block runs on: itself, or the host it is linked to
    const host = arch.edges.filter((e) => e.from === n.id && e.capability === "compute").map((e) => blockOf(arch.nodes.find((x) => x.id === e.to)?.block ?? "", services)?.provider)[0];
    const home = b.provider === "Your services" ? host : b.provider;
    for (const need of b.needs ?? []) {
      if (linked.has(need)) continue;
      // something already on the board that provides it
      // never something that needs the same thing itself (a CDN in front of another CDN)
      const fits = (c: { id: string; provides: Capability[]; needs?: Capability[] }) => c.provides.includes(need) && !(c.needs ?? []).includes(need) && c.id !== b.id;
      const onBoard = arch.nodes.find((x) => x.id !== n.id && (() => {
        const xb = blockOf(x.block, services);
        return !!xb && fits(xb);
      })());
      if (onBoard) {
        out.push({ title: `Link ${n.label ?? b.name} to ${onBoard.label ?? blockOf(onBoard.block, services)!.name}`, why: `${b.name} needs ${CAPABILITIES[need]}, and it is already on the board.`, add: [], links: [{ from: n.id, to: onBoard.id, capability: need }] });
        continue;
      }
      const reachable = COMPONENTS.filter((c) => fits(c) && (!c.reachableFrom || (home && c.reachableFrom.includes(home))));
      // same platform first, then the rest
      const ranked = [...reachable.filter((c) => c.provider === home), ...reachable.filter((c) => c.provider !== home)].slice(0, 3);
      for (const c of ranked) out.push({ title: `Add ${c.name} for ${n.label ?? b.name}`, why: `${b.name} needs ${CAPABILITIES[need]}; ${c.name} provides it${c.provider === home ? ` on ${home}` : ""}.`, add: [{ block: c.id }], links: [{ from: n.id, to: "new:0", capability: need }] });
    }
  }
  return out;
}

const PROMPT = (arch: Architecture, services: Service[], issues: ArchitectureIssue[], goal: string) => `You are Garry, an architect for a team's services. Suggest improvements to their architecture board.

Blocks you may add (id: provides / needs / reachable only from):
${COMPONENTS.map((c) => `- ${c.id} (${c.name}, ${c.provider}): ${c.provides.join(",") || "-"} / ${(c.needs ?? []).join(",") || "-"}${c.reachableFrom ? ` / ${c.reachableFrom.join(",")}` : ""}`).join("\n")}
Their services (blocks service:<name>): ${services.map((s) => `${s.name} (${s.kind ?? "mfe-remote"}${s.db ? ", has a database" : ""})`).join("; ") || "none yet"}
Capabilities: ${Object.keys(CAPABILITIES).join(", ")}

The board now (nodes id=block, links from need to provider):
${JSON.stringify(arch)}
What the rules say: ${issues.map((i) => i.message).join(" | ") || "nothing"}
Their goal: ${goal || "a sound, simple, affordable setup for what is on the board"}

Answer with JSON only, no prose around it:
{"summary": "one or two sentences", "suggestions": [{"title": "short", "why": "one sentence, concrete (cost, latency, limits, lock in)", "add": [{"block": "<an id from the list>", "label": "optional"}], "links": [{"from": "<node id or new:<index>>", "to": "<node id or new:<index>>", "capability": "<capability>"}]}]}
At most 5 suggestions. A link goes from the block that needs to the block that provides. Prefer the platform they already use.`;

/** Runs Claude Code once and returns its suggestions, keeping only blocks and links that exist. */
export async function aiSuggestions(arch: Architecture, services: Service[], goal = "", opts: { model?: string; timeoutMs?: number } = {}): Promise<{ summary: string; suggestions: Suggestion[] }> {
  const bin = process.env.GARRY_CLAUDE_BIN?.trim() || "claude";
  const args = ["-p", PROMPT(arch, services, checkArchitecture(arch, services), goal.slice(0, 2000)), "--output-format", "json", ...(opts.model ? ["--model", opts.model] : [])];
  const text = await new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs ?? 120_000);
    child.on("error", (e: NodeJS.ErrnoException) => reject(new Error(e.code === "ENOENT" ? `${bin} not found: install Claude Code and sign in (claude)` : e.message)));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(err.trim().slice(0, 300) || `${bin} exited with ${code}`));
      resolve(out);
    });
  });
  // claude --output-format json wraps the answer: {"result": "..."}
  let answer = text;
  try {
    const wrapped = JSON.parse(text) as { result?: string };
    if (typeof wrapped.result === "string") answer = wrapped.result;
  } catch {
    /* plain text */
  }
  const json = /\{[\s\S]*\}/.exec(answer)?.[0];
  if (!json) throw new Error("Garry's answer had no suggestions in it");
  const parsed = JSON.parse(json) as { summary?: string; suggestions?: Suggestion[] };
  const ids = new Set(arch.nodes.map((n) => n.id));
  const caps = new Set(Object.keys(CAPABILITIES));
  const suggestions = (parsed.suggestions ?? []).slice(0, 5).flatMap((s) => {
    const add = (Array.isArray(s.add) ? s.add : []).filter((a) => blockOf(String(a?.block), services));
    const fits = (ref: string) => ids.has(ref) || (/^new:\d+$/.test(ref) && Number(ref.slice(4)) < add.length);
    const links = (Array.isArray(s.links) ? s.links : []).filter((l) => l && fits(String(l.from)) && fits(String(l.to)) && caps.has(String(l.capability)));
    if (!add.length && !links.length) return [];
    return [{ title: String(s.title ?? "Suggestion").slice(0, 120), why: String(s.why ?? "").slice(0, 400), add, links }];
  });
  return { summary: String(parsed.summary ?? "").slice(0, 400), suggestions };
}
