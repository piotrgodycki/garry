import { join } from "node:path";
import { addWorktree, commitAll, diff, git, remoteSlug, removeWorktree, type Diff } from "./git.js";
import { runTurn, type RunningTurn } from "./agent.js";
import { now, ThreadStore, type Thread, type ThreadEvent } from "./store.js";
import { GitHub } from "../github/client.js";
import { githubToken } from "../github/env.js";
import { gitAuthArgs } from "../github/connect.js";
import { pushRefusal } from "./settings.js";
import { QA_LABEL, assessQa, parseDiff, qaMarkdown } from "../review/qa.js";
import { oversizedStaged, sizeMessage } from "../hooks/filesize.js";

/** A commit refused because a file is too large for an agent to read whole; the message says how to split it. */
export class FileSizeError extends Error {
  readonly status = 422;
}

type Listener = (e: ThreadEvent) => void;

/** A push that waits for a person's yes (the project asks before pushing), or that is refused. */
export class PushError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 428,
  ) {
    super(message);
  }
}

/** What a push would do, shown before a person says yes. */
export interface PushPreview {
  branch: string;
  /** owner/name on GitHub, null when the project has no GitHub remote */
  remote: string | null;
  base: string;
  commits: { sha: string; subject: string }[];
  mode: "ask" | "allow" | "never";
  draft: boolean;
  /** why the push would be refused, if it would */
  refused: string | null;
}

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
  private everyone = new Set<(threadId: string, e: ThreadEvent) => void>();

  constructor(readonly store = new ThreadStore()) {}

  subscribe(threadId: string, fn: Listener): () => void {
    const set = this.listeners.get(threadId) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(threadId, set);
    return () => set.delete(fn);
  }

  /** Every event of every thread (the menu bar icon, notifications). */
  subscribeAll(fn: (threadId: string, e: ThreadEvent) => void): () => void {
    this.everyone.add(fn);
    return () => this.everyone.delete(fn);
  }

  private emit(threadId: string, e: ThreadEvent): void {
    this.store.append(threadId, e);
    for (const fn of this.listeners.get(threadId) ?? []) fn(e);
    for (const fn of this.everyone) fn(threadId, e);
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
    const branch = `${this.store.settings(projectId).branchPrefix}${slug(name)}-${id}`;
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

  /**
   * Another agent in the same working copy (branch and worktree) as a thread:
   * a reviewer of its work, or the next step of a chain, with its own
   * conversation. Removing it later leaves the working copy to its owner.
   */
  join(threadId: string, prompt: string, title: string, role: "reviewer" | "step"): Thread {
    const owner = this.mustGet(threadId);
    const root = owner.sharesWith ? this.mustGet(owner.sharesWith) : owner;
    if (!prompt.trim()) throw new Error("the prompt is empty");
    const t = this.store.save({ ...root, id: this.store.newId(), title: title.trim().slice(0, 80), status: "idle", sessionId: null, createdAt: now(), updatedAt: now(), commit: undefined, pr: undefined, sharesWith: root.id, role });
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
    const max = this.store.settings(t.projectId).maxFileTokens;
    t.commit = commitAll(t.worktree, message.trim() || t.title, () => {
      const over = max ? oversizedStaged(t.worktree, max) : [];
      if (over.length) throw new FileSizeError(sizeMessage(over, max));
    });
    this.store.save(t);
    this.emit(t.id, { type: "git", action: "commit", detail: t.commit, at: now() });
    return t;
  }

  /** What pushing this thread would do: the branch, where it goes, the commits, and whether it is allowed. */
  async pushPreview(threadId: string): Promise<PushPreview> {
    const t = this.mustGet(threadId);
    const settings = this.store.settings(t.projectId);
    const slug = remoteSlug(this.store.project(t.projectId)!.path);
    const token = githubToken();
    const base = settings.baseBranch || (slug && token ? await new GitHub(token).defaultBranch(slug.owner, slug.name).catch(() => "") : "") || "the default branch";
    const commits = git(t.worktree, ["log", "--format=%h%x09%s", `${t.baseSha}..HEAD`])
      .split("\n")
      .filter(Boolean)
      .map((l) => ({ sha: l.split("\t")[0], subject: l.split("\t").slice(1).join("\t") }));
    return { branch: t.branch, remote: slug ? `${slug.owner}/${slug.name}` : null, base, commits, mode: settings.push, draft: settings.draftPr, refused: pushRefusal(settings, t.branch, base) };
  }

  /**
   * Pushes the thread's branch and opens a pull request. The project's
   * settings decide: never pushes, asks first (confirmed must be true, after
   * the person saw the preview), and never to a protected branch or the base.
   * Never forced: a push GitHub would have to overwrite fails.
   */
  async openPr(threadId: string, title?: string, body?: string, confirmed = false): Promise<Thread> {
    const t = this.mustGet(threadId);
    const project = this.store.project(t.projectId)!;
    const settings = this.store.settings(t.projectId);
    if (settings.push === "never") throw new PushError(pushRefusal(settings, t.branch, "")!, 403);
    const slug = remoteSlug(project.path);
    if (!slug) throw new Error("the project has no GitHub origin remote");
    const token = githubToken();
    if (!token) throw new Error("connect GitHub first (Settings, GitHub) or set GARRY_GITHUB_TOKEN in .env.local");
    if (this.running.has(threadId)) throw new Error("wait for the agent to finish");
    if (git(t.worktree, ["status", "--porcelain"]).trim()) throw new Error("commit the changes first");
    const gh = new GitHub(token);
    const base = settings.baseBranch || (await gh.defaultBranch(slug.owner, slug.name));
    const refused = pushRefusal(settings, t.branch, base);
    if (refused) throw new PushError(refused, 403);
    if (settings.push === "ask" && !confirmed) throw new PushError(`this project asks before pushing: confirm pushing ${t.branch} to ${slug.owner}/${slug.name}`, 428);
    // the token authenticates this one push; it is never written into the repository.
    // An explicit refspec: only this branch, to the branch of the same name.
    git(t.worktree, [...gitAuthArgs(token), "push", "--set-upstream", "origin", `refs/heads/${t.branch}:refs/heads/${t.branch}`]);
    // what a person has to try before this ships: a label and a checklist in the body
    const qa = assessQa(parseDiff(git(t.worktree, ["diff", "--no-color", `${t.baseSha}...HEAD`])));
    const text = [body ?? `Built with Garry in thread ${t.id}.`, qaMarkdown(qa)].join("\n\n");
    t.pr = await gh.openPr(slug.owner, slug.name, t.branch, base, title?.trim() || t.title, text, settings.draftPr);
    if (qa.needed) await gh.setLabel(slug.owner, slug.name, t.pr.number, QA_LABEL, true, "f97316", "Someone has to try this before it ships").catch(() => undefined);
    this.store.save(t);
    this.emit(t.id, { type: "git", action: "pr", detail: t.pr.url, at: now() });
    return t;
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

  private mustGet(threadId: string): Thread {
    const t = this.store.get(threadId);
    if (!t) throw new Error("unknown thread");
    return t;
  }
}
