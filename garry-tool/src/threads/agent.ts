import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type { ThreadEvent } from "./store.js";
import { now } from "./store.js";

/**
 * Runs one turn of Claude Code (the claude command, signed in with the user's
 * own Claude plan) in a thread's worktree and turns its stream-json output into
 * thread events. GARRY_CLAUDE_BIN points at another binary (tests use a fake).
 */

export interface TurnOptions {
  cwd: string;
  prompt: string;
  sessionId: string | null;
  /** what the agent may do without asking; edits stay inside the worktree */
  permissionMode?: string;
  allowedTools?: string[];
  model?: string;
}

/** The tools an agent may use without asking: read, edit, and read-only git. */
export const DEFAULT_ALLOWED_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep", "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(ls:*)"];

const SYSTEM = [
  "You are working for Garry in a git worktree made for this task; stay inside it.",
  "Do not commit, push, or open pull requests: the person reviews your changes in Garry and commits them there.",
  "Keep changes small and focused on the request. End each turn with a short summary of what you changed.",
].join(" ");

export interface RunningTurn {
  child: ChildProcess;
  done: Promise<{ ok: boolean; sessionId: string | null }>;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function summarize(name: string, input: Record<string, unknown>): string {
  const v = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.description ?? "";
  return clip(String(v), 200);
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : "")).join("\n");
  return "";
}

/** Maps one stream-json line from claude to thread events. */
export function toEvents(line: Record<string, unknown>): { events: ThreadEvent[]; sessionId?: string; result?: { ok: boolean } } {
  const at = now();
  const type = line.type;
  if (type === "system" && line.subtype === "init") return { events: [], sessionId: String(line.session_id ?? "") || undefined };
  if (type === "assistant") {
    const content = ((line.message as { content?: unknown[] })?.content ?? []) as Record<string, unknown>[];
    const events: ThreadEvent[] = [];
    for (const c of content) {
      if (c.type === "text" && typeof c.text === "string" && c.text.trim()) events.push({ type: "text", text: c.text, at });
      if (c.type === "tool_use") events.push({ type: "tool", id: String(c.id), name: String(c.name), summary: summarize(String(c.name), (c.input ?? {}) as Record<string, unknown>), at });
    }
    return { events };
  }
  if (type === "user") {
    const content = ((line.message as { content?: unknown[] })?.content ?? []) as Record<string, unknown>[];
    return {
      events: content
        .filter((c) => c.type === "tool_result")
        .map((c) => ({ type: "tool_result" as const, id: String(c.tool_use_id), ok: c.is_error !== true, preview: clip(resultText(c.content), 400), at })),
    };
  }
  if (type === "result") {
    const ok = line.subtype === "success" && line.is_error !== true;
    const cost = typeof line.total_cost_usd === "number" ? line.total_cost_usd : undefined;
    return { events: [{ type: "turn_end", ok, costUsd: cost, at }], result: { ok } };
  }
  return { events: [] };
}

/** Shows paths inside the worktree relative to it, as the person knows the project. */
function relative(e: ThreadEvent, cwd: string): ThreadEvent {
  const strip = (s: string) => s.split(`${cwd}/`).join("").split(cwd).join(".");
  if (e.type === "tool") return { ...e, summary: strip(e.summary) };
  if (e.type === "tool_result") return { ...e, preview: strip(e.preview) };
  if (e.type === "text") return { ...e, text: strip(e.text) };
  return e;
}

export function runTurn(opts: TurnOptions, onEvent: (e: ThreadEvent) => void): RunningTurn {
  const bin = process.env.GARRY_CLAUDE_BIN?.trim() || "claude";
  const args = [
    "-p",
    opts.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    opts.permissionMode ?? "acceptEdits",
    "--allowedTools",
    (opts.allowedTools ?? DEFAULT_ALLOWED_TOOLS).join(","),
    // belt and braces: even a permission mode that allows Bash cannot push or rewrite the remote
    "--disallowedTools",
    "Bash(git push:*),Bash(gh pr:*),Bash(git remote:*)",
    "--append-system-prompt",
    SYSTEM,
  ];
  if (opts.sessionId) args.push("--resume", opts.sessionId);
  if (opts.model) args.push("--model", opts.model);

  const child = spawn(bin, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"], env: process.env });
  let sessionId = opts.sessionId;
  let ok = false;
  let sawResult = false;
  let stderr = "";
  child.stderr?.on("data", (d) => (stderr = (stderr + String(d)).slice(-2000)));

  const done = new Promise<{ ok: boolean; sessionId: string | null }>((resolve) => {
    const rl = createInterface({ input: child.stdout! });
    rl.on("line", (raw) => {
      let line: Record<string, unknown>;
      try {
        line = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }
      const r = toEvents(line);
      if (r.sessionId) sessionId = r.sessionId;
      if (r.result) {
        ok = r.result.ok;
        sawResult = true;
      }
      for (const e of r.events) onEvent(relative(e, opts.cwd));
    });
    child.on("error", (e) => {
      const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
      onEvent({ type: "error", message: missing ? `${bin} not found: install Claude Code and sign in (claude), or set GARRY_CLAUDE_BIN` : String(e.message), at: now() });
      resolve({ ok: false, sessionId });
    });
    child.on("close", (code, signal) => {
      if (!sawResult) {
        const why = signal ? "stopped" : `claude exited with code ${code}${stderr.trim() ? `: ${clip(stderr.trim(), 500)}` : ""}`;
        onEvent({ type: "turn_end", ok: false, at: now() });
        if (!signal) onEvent({ type: "error", message: why, at: now() });
      }
      resolve({ ok: sawResult && ok, sessionId });
    });
  });
  return { child, done };
}
