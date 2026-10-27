import { join } from "node:path";
import { addWorktree, commitAll, diff, git, remoteSlug, removeWorktree, type Diff } from "./git.js";
import { runTurn, type RunningTurn } from "./agent.js";
import { now, ThreadStore, type Thread, type ThreadEvent } from "./store.js";
import { GitHub } from "../github/client.js";
import { githubToken } from "../github/env.js";
import { QA_LABEL, assessQa, parseDiff, qaMarkdown } from "../review/qa.js";

type Listener = (e: ThreadEvent) => void;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "work";

/**
 * Runs threads: creates the worktree, runs the agent turn by turn, keeps the
 * event log and tells live listeners (the dashboard, the phone) as it happens.
 */
export class ThreadManager {
  private running = new Map<string, RunningTurn>();
  private listeners = new Map<string, Set<Listener>>();

  constructor(readonly store = new ThreadStore()) {}

  subscribe(threadId: string, fn: Listener): () => void {
    const set = this.listeners.get(threadId) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(threadId, set);
    return () => set.delete(fn);
  }

  private emit(threadId: string, e: ThreadEvent): void {
    this.store.append(threadId, e);
    for (const fn of this.listeners.get(threadId) ?? []) fn(e);
  }

  private setStatus(t: Thread, status: Thread["status"]): void {
    t.status = status;
    this.store.save(t);
    this.emit(t.id, { type: "status", status, at: now() });
  }

  /** A new thread: a branch and worktree from the project's HEAD, then the first turn. */
  create(projectId: string, prompt: string, title?: string): Thread {
    const project = this.store.project(projectId);
    if (!project) throw new Error("unknown project");
    if (!prompt.trim()) throw new Error("the prompt is empty");
    const id = this.store.newId();
    const name = (title?.trim() || prompt.trim().split("\n")[0]).slice(0, 80);
    const branch = `garry/${slug(name)}-${id}`;
    const worktree = join(this.store.root, "worktrees", id);
    const baseSha = addWorktree(project.path, worktree, branch);
    const t = this.store.save({
      id,
      projectId,
      title: name,
      status: "idle",
      branch,
      worktree,
      baseSha,
      sessionId: null,
      createdAt: now(),
      updatedAt: now(),
    });
    this.send(t.id, prompt);
    return this.store.get(t.id)!;
  }

  /** One turn: the user's message, then the agent's work until it finishes. */
  send(threadId: string, text: string): void {
    const t = this.store.get(threadId);
    if (!t) throw new Error("unknown thread");
    if (this.running.has(threadId)) throw new Error("the agent is still working on this thread");
    if (!text.trim()) throw new Error("the message is empty");
    this.emit(t.id, { type: "user", text, at: now() });
    this.setStatus(t, "running");
    const turn = runTurn({ cwd: t.worktree, prompt: text, sessionId: t.sessionId }, (e) => this.emit(t.id, e));
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
    const t = this.mustGet(threadId);
    if (this.running.has(threadId)) throw new Error("wait for the agent to finish");
    if (!git(t.worktree, ["status", "--porcelain"]).trim()) throw new Error("nothing to commit");
    t.commit = commitAll(t.worktree, message.trim() || t.title);
    this.store.save(t);
    this.emit(t.id, { type: "git", action: "commit", detail: t.commit, at: now() });
    return t;
  }

  /** Pushes the thread's branch and opens a pull request (needs GARRY_GITHUB_TOKEN). */
  async openPr(threadId: string, title?: string, body?: string): Promise<Thread> {
    const t = this.mustGet(threadId);
    const project = this.store.project(t.projectId)!;
    const slug = remoteSlug(project.path);
    if (!slug) throw new Error("the project has no GitHub origin remote");
    const token = githubToken();
    if (!token) throw new Error("set GARRY_GITHUB_TOKEN in .env.local to open pull requests");
    if (git(t.worktree, ["status", "--porcelain"]).trim()) throw new Error("commit the changes first");
    git(t.worktree, ["push", "--set-upstream", "origin", t.branch]);
    const gh = new GitHub(token);
    const base = await gh.defaultBranch(slug.owner, slug.name);
    // what a person has to try before this ships: a label and a checklist in the body
    const qa = assessQa(parseDiff(git(t.worktree, ["diff", "--no-color", `${t.baseSha}...HEAD`])));
    const text = [body ?? `Built with Garry in thread ${t.id}.`, qaMarkdown(qa)].join("\n\n");
    t.pr = await gh.openPr(slug.owner, slug.name, t.branch, base, title?.trim() || t.title, text);
    if (qa.needed) await gh.setLabel(slug.owner, slug.name, t.pr.number, QA_LABEL, true, "f97316", "Someone has to try this before it ships").catch(() => undefined);
    this.store.save(t);
    this.emit(t.id, { type: "git", action: "pr", detail: t.pr.url, at: now() });
    return t;
  }

  remove(threadId: string): void {
    const t = this.mustGet(threadId);
    this.stop(threadId);
    const project = this.store.project(t.projectId);
    if (project) removeWorktree(project.path, t.worktree, t.branch);
    t.status = "idle";
    this.store.save(t);
  }

  private mustGet(threadId: string): Thread {
    const t = this.store.get(threadId);
    if (!t) throw new Error("unknown thread");
    return t;
  }
}
