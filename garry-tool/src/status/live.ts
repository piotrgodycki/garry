import type { ThreadManager } from "../threads/manager.js";
import type { Thread, ThreadEvent } from "../threads/store.js";
import { asksSomething } from "./status.js";

/**
 * Live: every agent as a lane on a timeline, worked out from the threads' own
 * event logs. A turn is a stretch of work, from your message to the turn's end;
 * what follows says what the agent left you with until you answer: a question
 * (needs you), a stop before finishing (failed), or work to review (ready).
 * Committing or opening the pull request ends the lane. What needs you comes
 * with the agent's own words, so you can answer from Live.
 */

export type LiveState = "work" | "wait" | "fail" | "done";

export interface LiveSegment {
  state: LiveState;
  from: string;
  /** null while it still goes on */
  to: string | null;
  /** what the stretch was: your message for work, the question or the problem after it */
  label: string;
}

export interface LiveLane {
  threadId: string;
  title: string;
  projectId: string;
  project: string;
  /** where the lane is now; null once shipped (committed or a pull request) */
  state: LiveState | null;
  segments: LiveSegment[];
  costUsd: number;
  turns: number;
  tools: number;
  /** the tool it is using now, while it works */
  doing: string | null;
  /** a reviewer of another agent's work, or a step of a chain; none for work you started */
  role?: "reviewer" | "step";
  startedAt: string;
  updatedAt: string;
}

export interface LiveAsk {
  threadId: string;
  title: string;
  project: string;
  kind: "question" | "stopped";
  /** the agent's own words: the end of its last message, or what went wrong */
  text: string;
  at: string;
}

export interface LiveView {
  now: string;
  lanes: LiveLane[];
  needsYou: LiveAsk[];
  /** what today's turns cost, across every lane */
  spentToday: number;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const firstLine = (s: string) => s.trim().split(/\n+/)[0] ?? "";

/** The lane of one thread. */
export function laneOf(t: Thread, project: string, events: ThreadEvent[], running: boolean): LiveLane {
  const segments: LiveSegment[] = [];
  const open = () => (segments.length && segments[segments.length - 1].to === null ? segments[segments.length - 1] : null);
  const close = (at: string) => {
    const s = open();
    if (s) s.to = at;
  };
  let costUsd = 0;
  let turns = 0;
  let tools = 0;
  let doing: string | null = null;
  let said = "";
  let failure = "";
  let shipped = false;
  for (const e of events) {
    if (e.type === "user") {
      close(e.at);
      segments.push({ state: "work", from: e.at, to: null, label: clip(firstLine(e.text), 120) });
      said = "";
      failure = "";
      doing = null;
      shipped = false;
    } else if (e.type === "tool") {
      tools++;
      doing = clip(`${e.name} ${e.summary}`.trim(), 120);
    } else if (e.type === "text") {
      said = e.text;
    } else if (e.type === "tool_result" && !e.ok) {
      failure = e.preview;
    } else if (e.type === "error") {
      failure = e.message;
    } else if (e.type === "turn_end") {
      turns++;
      costUsd += e.costUsd ?? 0;
      close(e.at);
      doing = null;
      if (!e.ok) segments.push({ state: "fail", from: e.at, to: null, label: clip(firstLine(failure) || "Stopped before finishing", 300) });
      else if (asksSomething(said)) segments.push({ state: "wait", from: e.at, to: null, label: clip(said.trim().split(/\n+/).pop() ?? "", 400) });
      else segments.push({ state: "done", from: e.at, to: null, label: "Ready for your review" });
    } else if (e.type === "git") {
      close(e.at);
      shipped = true;
    }
  }
  // a turn that is not running any more but never ended: the agent was cut off
  const last = open();
  if (last?.state === "work" && !running) {
    last.to = t.updatedAt > last.from ? t.updatedAt : last.from;
    segments.push({ state: "fail", from: last.to, to: null, label: clip(firstLine(failure) || "Stopped before finishing", 300) });
  }
  // the thread itself ended in an error after a turn that looked fine
  const tail = open();
  if (tail?.state === "done" && t.status === "error") Object.assign(tail, { state: "fail", label: clip(firstLine(failure) || "Stopped before finishing", 300) });
  if (t.pr || t.commit) shipped = true;
  if (shipped) close(t.updatedAt);
  const now = open();
  return {
    threadId: t.id,
    title: t.title,
    projectId: t.projectId,
    project,
    state: shipped ? null : (now?.state ?? null),
    segments,
    costUsd,
    turns,
    tools,
    doing: running ? doing : null,
    role: t.role,
    startedAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/**
 * Live for some threads (the active Garry project's): lanes touched since
 * `since`, or still waiting on you or working whenever they started; the ones
 * that need you first, then working, then the rest, newest first.
 */
export function liveView(threads: ThreadManager, threadIds: Set<string>, since: Date, now = new Date()): LiveView {
  const names = new Map(threads.store.projects().map((p) => [p.id, p.name]));
  const order: Record<LiveState, number> = { wait: 0, fail: 0, work: 1, done: 2 };
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  let spentToday = 0;
  const lanes = threads.store
    .threads()
    .filter((t) => threadIds.has(t.id))
    .map((t) => {
      const events = threads.store.events(t.id);
      for (const e of events) if (e.type === "turn_end" && e.costUsd && new Date(e.at) >= day) spentToday += e.costUsd;
      return laneOf(t, names.get(t.projectId) ?? "", events, threads.isRunning(t.id));
    })
    .filter((l) => (l.state !== null && l.state !== "done") || new Date(l.updatedAt) >= since)
    .sort((a, b) => (a.state ? order[a.state] : 3) - (b.state ? order[b.state] : 3) || b.updatedAt.localeCompare(a.updatedAt));
  const needsYou = lanes
    .filter((l) => l.state === "wait" || l.state === "fail")
    .map((l) => {
      const s = l.segments[l.segments.length - 1];
      return { threadId: l.threadId, title: l.title, project: l.project, kind: l.state === "wait" ? "question" : "stopped", text: s.label, at: s.from } satisfies LiveAsk;
    })
    .sort((a, b) => a.at.localeCompare(b.at));
  return { now: now.toISOString(), lanes, needsYou, spentToday };
}
