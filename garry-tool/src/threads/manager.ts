import { join } from "node:path";
import { oversizedStaged, sizeMessage } from "../hooks/filesize.js";
import { runTurn, type RunningTurn, type TurnOptions } from "./agent.js";
import { FileSizeError } from "./errors.js";
import { ThreadEvents } from "./events.js";
import { addWorktree, commitAll, diff, git, removeWorktree, type Diff } from "./git.js";
import { Publisher, type OpenPrRequest, type PushPreview } from "./publish.js";
import { now, ThreadStore, type Thread, type ThreadEvent } from "./store.js";

export { FileSizeError, PushError } from "./errors.js";
export type { PushPreview } from "./publish.js";

/** What an agent in a repository is given on top of Garry's own rules (its layers). */
export type AgentContext = (projectId: string) => { prompt: string; dirs: string[] } | null;
export type TurnRunner = (opts: TurnOptions, onEvent: (e: ThreadEvent) => void) => RunningTurn;

export interface ThreadManagerOptions {
  runner?: TurnRunner;
  publisher?: (store: ThreadStore, events: ThreadEvents) => Publisher;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "work";

/**
 * A thread is one piece of work: its own branch and worktree, an agent conversation
 * run turn by turn, and a log that the dashboard and the phone follow live.
 */
export class ThreadManager {
  context: AgentContext | null = null;

  private readonly running = new Map<string, RunningTurn>();
  private readonly events: ThreadEvents;
  private readonly publisher: Publisher;
  private readonly runner: TurnRunner;

  constructor(
    readonly store = new ThreadStore(),
    { runner = runTurn, publisher = (s, e) => new Publisher(s, e) }: ThreadManagerOptions = {},
  ) {
    this.events = new ThreadEvents(store);
    this.publisher = publisher(store, this.events);
    this.runner = runner;
  }

  subscribe(threadId: string, fn: (e: ThreadEvent) => void): () => void {
    return this.events.subscribe(threadId, fn);
  }

  subscribeAll(fn: (threadId: string, e: ThreadEvent) => void): () => void {
    return this.events.subscribeAll(fn);
  }

  create(projectId: string, prompt: string, title?: string): Thread {
    const project = this.store.project(projectId);
    if (!project) throw new Error("unknown project");
    if (!prompt.trim()) throw new Error("the prompt is empty");
    const id = this.store.newId();
    const name = (title?.trim() || prompt.trim().split("\n")[0]).slice(0, 80);
    const branch = `${this.store.settings(projectId).branchPrefix}${slug(name)}-${id}`;
    const worktree = join(this.store.root, "worktrees", id);
    const baseSha = addWorktree(project.path, worktree, branch);
    this.store.save({ id, projectId, title: name, status: "idle", branch, worktree, baseSha, sessionId: null, createdAt: now(), updatedAt: now() });
    this.send(id, prompt);
    return this.store.get(id)!;
  }

  /** Another agent in a thread's working copy (a reviewer, or the next step of a chain), with a conversation of its own. */
  join(threadId: string, prompt: string, title: string, role: "reviewer" | "step"): Thread {
    const owner = this.mustGet(threadId);
    const root = owner.sharesWith ? this.mustGet(owner.sharesWith) : owner;
    if (!prompt.trim()) throw new Error("the prompt is empty");
    const t = this.store.save({
      ...root,
      id: this.store.newId(),
      title: title.trim().slice(0, 80),
      status: "idle",
      sessionId: null,
      createdAt: now(),
      updatedAt: now(),
      commit: undefined,
      pr: undefined,
      sharesWith: root.id,
      role,
    });
    this.send(t.id, prompt);
    return this.store.get(t.id)!;
  }

  send(threadId: string, text: string): void {
    const t = this.mustGet(threadId);
    if (this.running.has(threadId)) throw new Error("the agent is still working on this thread");
    if (!text.trim()) throw new Error("the message is empty");
    this.events.emit(t.id, { type: "user", text, at: now() });
    this.setStatus(t, "running");
    const ctx = this.contextFor(t.projectId);
    const turn = this.runner({ cwd: t.worktree, prompt: text, sessionId: t.sessionId, context: ctx?.prompt, addDirs: ctx?.dirs }, (e) =>
      this.events.emit(t.id, e),
    );
    this.running.set(t.id, turn);
    void turn.done.then(({ ok, sessionId }) => {
      this.running.delete(t.id);
      const latest = this.store.get(t.id) ?? t;
      latest.sessionId = sessionId ?? latest.sessionId;
      this.setStatus(latest, ok ? "idle" : "error");
    });
  }

  stop(threadId: string): boolean {
    const turn = this.running.get(threadId);
    if (!turn) return false;
    turn.child.kill("SIGINT");
    setTimeout(() => turn.child.exitCode === null && turn.child.kill("SIGKILL"), 5000).unref();
    return true;
  }

  isRunning(threadId: string): boolean {
    return this.running.has(threadId);
  }

  diff(threadId: string): Diff {
    const t = this.mustGet(threadId);
    return diff(t.worktree, t.baseSha);
  }

  commit(threadId: string, message: string): Thread {
    const t = this.mustIdle(threadId);
    if (!git(t.worktree, ["status", "--porcelain"]).trim()) throw new Error("nothing to commit");
    const max = this.store.settings(t.projectId).maxFileTokens;
    t.commit = commitAll(t.worktree, message.trim() || t.title, () => {
      const over = max ? oversizedStaged(t.worktree, max) : [];
      if (over.length) throw new FileSizeError(sizeMessage(over, max));
    });
    this.store.save(t);
    this.events.emit(t.id, { type: "git", action: "commit", detail: t.commit, at: now() });
    return t;
  }

  pushPreview(threadId: string): Promise<PushPreview> {
    return this.publisher.preview(this.mustGet(threadId));
  }

  openPr(threadId: string, title?: string, body?: string, confirmed = false, create?: OpenPrRequest["create"]): Promise<Thread> {
    return this.publisher.openPr(this.mustIdle(threadId), { title, body, confirmed, create });
  }

  remove(threadId: string): void {
    const t = this.mustGet(threadId);
    this.stop(threadId);
    const project = this.store.project(t.projectId);
    // an agent that joined another's working copy leaves it to its owner
    if (project && !t.sharesWith) removeWorktree(project.path, t.worktree, t.branch);
    t.status = "idle";
    this.store.save(t);
  }

  private setStatus(t: Thread, status: Thread["status"]): void {
    t.status = status;
    this.store.save(t);
    this.events.emit(t.id, { type: "status", status, at: now() });
  }

  /** A broken layer or registry never keeps an agent from working: it runs with Garry's rules alone. */
  private contextFor(projectId: string) {
    try {
      return this.context?.(projectId) ?? null;
    } catch {
      return null;
    }
  }

  private mustGet(threadId: string): Thread {
    const t = this.store.get(threadId);
    if (!t) throw new Error("unknown thread");
    return t;
  }

  private mustIdle(threadId: string): Thread {
    if (this.running.has(threadId)) throw new Error("wait for the agent to finish");
    return this.mustGet(threadId);
  }
}
