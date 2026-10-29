import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ThreadManager } from "../threads/manager.js";
import { now, type ThreadEvent } from "../threads/store.js";
import { asksSomething } from "../status/status.js";

/**
 * Agents working together, in one working copy.
 *
 * A pair: one agent writes, and each time it finishes a reviewer looks at its
 * changes and answers APPROVED, or CHANGES with what to fix; the writer fixes
 * them, the reviewer looks again, up to a number of rounds. A chain: steps in
 * the order you set, each its own agent, the next starting when the one
 * before is done, building on its work. You can add, drop and reorder the
 * steps that have not started, and start a chain after work already done.
 * When an agent asks you something or stops, the pair or chain waits for you
 * and goes on once your answer's turn ends well. Kept in
 * ~/.garry/garry-teams.json.
 */
export interface Pair {
  id: string;
  projectId: string;
  task: string;
  writer: string;
  reviewer?: string;
  round: number;
  maxRounds: number;
  status: "writing" | "reviewing" | "approved" | "needs-you";
  lastReview?: string;
  createdAt: string;
}

export interface ChainStep {
  id: string;
  prompt: string;
  threadId?: string;
  status: "waiting" | "running" | "done" | "needs-you" | "dropped";
}

export interface Chain {
  id: string;
  name: string;
  projectId: string;
  steps: ChainStep[];
  status: "running" | "needs-you" | "done" | "stopped";
  createdAt: string;
}

export class TeamError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const REVIEW = (task: string) =>
  `[review] You are the reviewer in a pair. Another agent is working in this folder on: "${task}". Look at its changes (git status, git diff) and read the files it changed. Do not edit anything. If the work is complete and correct, answer with a first line APPROVED. Otherwise answer with a first line CHANGES, then each concrete change it should make, one per line.`;
const REVIEW_AGAIN = "[review] The other agent changed the work after your review. Look again (git diff) and answer APPROVED or CHANGES as before.";
const FIX = (review: string) => `The reviewer asks for these changes:\n${review}\nMake them, then say what you changed.`;

/** How an agent's last turn ended: well, with a question to you, or not at all. */
export function outcome(events: ThreadEvent[]): { result: "done" | "asks" | "failed"; said: string } {
  const lastUser = events.map((e) => e.type).lastIndexOf("user");
  const turn = events.slice(lastUser + 1);
  const end = turn.find((e) => e.type === "turn_end") as Extract<ThreadEvent, { type: "turn_end" }> | undefined;
  const texts = turn.filter((e) => e.type === "text") as Extract<ThreadEvent, { type: "text" }>[];
  const said = texts.length ? texts[texts.length - 1].text : "";
  if (!end || !end.ok) return { result: "failed", said };
  return { result: asksSomething(said) ? "asks" : "done", said };
}

export class Teams {
  private file: string;
  private data: { pairs: Pair[]; chains: Chain[] };
  private off: () => void;

  constructor(private threads: ThreadManager) {
    this.file = join(threads.store.root, "garry-teams.json");
    this.data = existsSync(this.file) ? this.read() : { pairs: [], chains: [] };
    // an agent is free again: its pair or chain may go on
    this.off = threads.subscribeAll((threadId, e) => {
      if (e.type === "status" && e.status !== "running") this.ended(threadId);
    });
  }

  close(): void {
    this.off();
  }

  pairs(): Pair[] {
    return this.data.pairs;
  }

  chains(): Chain[] {
    return this.data.chains;
  }

  /** A writer starts on the task; a reviewer follows each time it finishes. */
  startPair(projectId: string, task: string, maxRounds = 3): Pair {
    if (!task.trim()) throw new TeamError("the task is empty");
    if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 10) throw new TeamError("rounds: 1 to 10");
    const writer = this.threads.create(projectId, task);
    const pair: Pair = { id: this.threads.store.newId(), projectId, task: task.trim(), writer: writer.id, round: 0, maxRounds, status: "writing", createdAt: now() };
    this.data.pairs.push(pair);
    this.write();
    return pair;
  }

  /** Steps in order, each its own agent in one working copy; after: start once that work is done. */
  startChain(projectId: string, prompts: string[], name = "", after?: string): Chain {
    const steps = prompts.map((p) => p.trim()).filter(Boolean);
    if (!steps.length && !after) throw new TeamError("a chain needs at least one step");
    const chain: Chain = { id: this.threads.store.newId(), name: name.trim() || steps[0]?.split("\n")[0].slice(0, 60) || "Chain", projectId, steps: steps.map((prompt) => ({ id: this.threads.store.newId(), prompt, status: "waiting" })), status: "running", createdAt: now() };
    if (after) {
      const t = this.threads.store.get(after);
      if (!t || t.projectId !== projectId) throw new TeamError("that work is not in this repository", 404);
      // the work you start from is the chain's first step
      const result = this.threads.isRunning(after) ? null : outcome(this.threads.store.events(after)).result;
      chain.steps.unshift({ id: this.threads.store.newId(), prompt: t.title, threadId: after, status: result === null ? "running" : result === "done" ? "done" : "needs-you" });
      if (result && result !== "done") chain.status = "needs-you";
    }
    this.data.chains.push(chain);
    this.advance(chain);
    this.write();
    return chain;
  }

  addStep(chainId: string, prompt: string): Chain {
    const chain = this.chain(chainId);
    if (chain.status === "stopped") throw new TeamError("the chain is stopped", 409);
    if (!prompt.trim()) throw new TeamError("the step is empty");
    chain.steps.push({ id: this.threads.store.newId(), prompt: prompt.trim(), status: "waiting" });
    if (chain.status === "done") chain.status = "running";
    this.advance(chain);
    this.write();
    return chain;
  }

  /** A new order for the steps that have not started; the rest stay where they are. */
  reorder(chainId: string, order: string[]): Chain {
    const chain = this.chain(chainId);
    const waiting = chain.steps.filter((s) => s.status === "waiting");
    if (order.length !== waiting.length || !waiting.every((s) => order.includes(s.id))) throw new TeamError("order: every step that has not started, once each");
    const started = chain.steps.filter((s) => s.status !== "waiting");
    chain.steps = [...started, ...order.map((id) => waiting.find((s) => s.id === id)!)];
    this.write();
    return chain;
  }

  dropStep(chainId: string, stepId: string): Chain {
    const chain = this.chain(chainId);
    const step = chain.steps.find((s) => s.id === stepId);
    if (!step) throw new TeamError("no such step", 404);
    if (step.status !== "waiting") throw new TeamError("it has already started; stop it in Build", 409);
    step.status = "dropped";
    this.advance(chain);
    this.write();
    return chain;
  }

  /** Nothing more starts; the step that runs finishes on its own (stop it in Build). */
  stopChain(chainId: string): Chain {
    const chain = this.chain(chainId);
    for (const s of chain.steps) if (s.status === "waiting") s.status = "dropped";
    chain.status = "stopped";
    this.write();
    return chain;
  }

  private chain(id: string): Chain {
    const c = this.data.chains.find((x) => x.id === id);
    if (!c) throw new TeamError("no such chain", 404);
    return c;
  }

  private ended(threadId: string): void {
    const { result, said } = outcome(this.threads.store.events(threadId));
    for (const pair of this.data.pairs) {
      if (pair.status === "approved") continue;
      if (threadId === pair.writer) this.writerEnded(pair, result);
      else if (threadId === pair.reviewer) this.reviewerEnded(pair, result, said);
    }
    for (const chain of this.data.chains) {
      const step = chain.steps.find((s) => s.threadId === threadId);
      if (!step || chain.status === "stopped" || step.status === "done") continue;
      step.status = result === "done" ? "done" : "needs-you";
      chain.status = result === "done" ? "running" : "needs-you";
      try {
        this.advance(chain);
      } catch {
        // the step that could not start is marked; the chain waits for you
      }
    }
    this.write();
  }

  private writerEnded(pair: Pair, result: "done" | "asks" | "failed"): void {
    if (result !== "done") return void (pair.status = "needs-you");
    if (pair.round >= pair.maxRounds) return void (pair.status = "needs-you");
    pair.status = "reviewing";
    if (!pair.reviewer) pair.reviewer = this.threads.join(pair.writer, REVIEW(pair.task), `Review: ${pair.task.split("\n")[0].slice(0, 60)}`, "reviewer").id;
    else this.threads.send(pair.reviewer, REVIEW_AGAIN);
  }

  private reviewerEnded(pair: Pair, result: "done" | "asks" | "failed", said: string): void {
    if (result === "failed") return void (pair.status = "needs-you");
    pair.lastReview = said.trim();
    if (/^\s*APPROVED\b/i.test(said)) return void (pair.status = "approved");
    pair.round++;
    if (pair.round >= pair.maxRounds) return void (pair.status = "needs-you");
    pair.status = "writing";
    this.threads.send(pair.writer, FIX(said.replace(/^\s*CHANGES\s*\n?/i, "").trim() || said.trim()));
  }

  /** Starts the next step when nothing of the chain runs and nothing waits on you. */
  private advance(chain: Chain): void {
    if (chain.status !== "running" || chain.steps.some((s) => s.status === "running")) return;
    const next = chain.steps.find((s) => s.status === "waiting");
    if (!next) return void (chain.status = "done");
    const before = [...chain.steps.slice(0, chain.steps.indexOf(next))].reverse().find((s) => s.threadId);
    const title = `${chain.name}: ${next.prompt.split("\n")[0]}`.slice(0, 80);
    try {
      next.threadId = before?.threadId ? this.threads.join(before.threadId, next.prompt, title, "step").id : this.threads.create(chain.projectId, next.prompt, title).id;
      next.status = "running";
    } catch (e) {
      next.status = "needs-you";
      chain.status = "needs-you";
      throw e;
    }
  }

  private read(): { pairs: Pair[]; chains: Chain[] } {
    try {
      const d = JSON.parse(readFileSync(this.file, "utf8")) as { pairs?: Pair[]; chains?: Chain[] };
      return { pairs: d.pairs ?? [], chains: d.chains ?? [] };
    } catch {
      return { pairs: [], chains: [] };
    }
  }

  private write(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
