import type { ThreadManager } from "../threads/manager.js";
import type { Thread, ThreadEvent } from "../threads/store.js";

/**
 * Garry at a glance: is an agent working, does one need you, is something
 * ready. One answer for the menu bar on a Mac, the iPhone app and the
 * dashboard, worked out from the threads and their event logs.
 *
 * - working: an agent is in a turn right now
 * - needs-you: a turn ended with a question to you, or the agent stopped on an error
 * - done: a turn ended and the work waits for your review (not committed yet)
 * - idle: nothing in flight
 */

export type GarryState = "idle" | "working" | "needs-you" | "done";

export interface StatusItem {
  threadId: string;
  title: string;
  projectId: string;
  state: Exclude<GarryState, "idle">;
  /** one line: what it is doing, what it asks, or that it is ready */
  detail: string;
  at: string;
}

export interface GarryStatus {
  state: GarryState;
  /** how many need you, how many are working, how many are ready */
  counts: { needsYou: number; working: number; done: number };
  items: StatusItem[];
}

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The agent's last words in its last turn, if that turn ended well. */
function lastTurn(events: ThreadEvent[]): { ended: boolean; ok: boolean; text: string; at: string } | null {
  let end = -1;
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === "turn_end") {
    end = i;
    break;
  }
  if (end < 0) return null;
  const e = events[end] as Extract<ThreadEvent, { type: "turn_end" }>;
  let text = "";
  for (let i = end - 1; i >= 0 && events[i].type !== "user"; i--) {
    const ev = events[i];
    if (ev.type === "text") {
      text = ev.text;
      break;
    }
  }
  return { ended: true, ok: e.ok, text, at: e.at };
}

/** A turn that ends by asking: the last sentence is a question. */
export function asksSomething(text: string): boolean {
  const last = text.trim().split(/\n+/).filter(Boolean).pop() ?? "";
  return /\?\s*\**\s*$/.test(last);
}

export function threadState(t: Thread, events: ThreadEvent[], running: boolean): StatusItem | null {
  const base = { threadId: t.id, title: t.title, projectId: t.projectId };
  if (running) {
    const tool = [...events].reverse().find((e) => e.type === "tool") as Extract<ThreadEvent, { type: "tool" }> | undefined;
    return { ...base, state: "working", detail: tool ? clip(`${tool.name} ${tool.summary}`) : "Working", at: t.updatedAt };
  }
  // shipped or committed: nothing waits on you here
  if (t.pr || t.commit) return null;
  // a turn that never ended while nothing runs it: the agent was cut off
  const lastUser = events.map((e) => e.type).lastIndexOf("user");
  if (lastUser > events.map((e) => e.type).lastIndexOf("turn_end")) return { ...base, state: "needs-you", detail: "Stopped before finishing: look at what happened", at: t.updatedAt };
  const turn = lastTurn(events);
  if (!turn) return null;
  if (!turn.ok || t.status === "error") return { ...base, state: "needs-you", detail: "Stopped before finishing: look at what happened", at: turn.at };
  if (asksSomething(turn.text)) return { ...base, state: "needs-you", detail: clip(turn.text.trim().split(/\n+/).pop() ?? ""), at: turn.at };
  return { ...base, state: "done", detail: "Ready for your review", at: turn.at };
}

export function garryStatus(threads: ThreadManager, threadIds?: Set<string>): GarryStatus {
  const order: Record<StatusItem["state"], number> = { "needs-you": 0, working: 1, done: 2 };
  const items = threads.store
    .threads()
    .filter((t) => !threadIds || threadIds.has(t.id))
    .map((t) => threadState(t, threads.store.events(t.id), threads.isRunning(t.id)))
    .filter((i): i is StatusItem => i !== null)
    .sort((a, b) => order[a.state] - order[b.state] || b.at.localeCompare(a.at));
  const counts = {
    needsYou: items.filter((i) => i.state === "needs-you").length,
    working: items.filter((i) => i.state === "working").length,
    done: items.filter((i) => i.state === "done").length,
  };
  const state: GarryState = counts.needsYou ? "needs-you" : counts.working ? "working" : counts.done ? "done" : "idle";
  return { state, counts, items };
}

/**
 * What is worth a notification between two looks at the status: a thread that
 * now needs you, or that is now ready, and was not before. Working is not
 * news; the menu bar shows it.
 */
export function statusChanges(prev: GarryStatus | null, next: GarryStatus): StatusItem[] {
  const before = new Map((prev?.items ?? []).map((i) => [i.threadId, i]));
  return next.items.filter((i) => {
    if (i.state === "working") return false;
    const was = before.get(i.threadId);
    // a new question in the same thread counts again
    return !was || was.state !== i.state || was.at !== i.at;
  });
}
