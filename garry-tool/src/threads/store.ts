import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { garryHome } from "../server/auth.js";
import { applySettings, settingsOf, type ProjectSettings } from "./settings.js";

/**
 * Projects and threads. A project is a git repository on this machine; a thread
 * is one piece of work in it: its own branch and worktree, the agent's session,
 * and every event of the conversation. Everything lives under ~/.garry (or
 * $GARRY_HOME): projects.json and threads/<id>/{thread.json,events.jsonl}.
 */

export interface Project {
  id: string;
  name: string;
  path: string;
  /** what Garry may do with the remote; missing fields are the defaults */
  settings?: Partial<ProjectSettings>;
  /** the Garry project it belongs to; none is the default project */
  garryProject?: string;
}

export type ThreadStatus = "running" | "idle" | "error";

export interface Thread {
  id: string;
  projectId: string;
  title: string;
  status: ThreadStatus;
  branch: string;
  worktree: string;
  baseSha: string;
  /** the agent's session, resumed on every follow-up message */
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
  /** set once the work is committed or opened as a pull request */
  commit?: string;
  /** another agent in the working copy of this thread (a reviewer, a chain's next step) */
  sharesWith?: string;
  /** what this agent does there: reviews the work, or is one step of a chain */
  role?: "reviewer" | "step";
  pr?: { number: number; url: string };
}

/** What a thread shows: the conversation, normalized from the agent's own stream. */
export type ThreadEvent =
  | { type: "user"; text: string; at: string }
  | { type: "text"; text: string; at: string }
  | { type: "tool"; id: string; name: string; summary: string; at: string }
  | { type: "tool_result"; id: string; ok: boolean; preview: string; at: string }
  | { type: "turn_end"; ok: boolean; costUsd?: number; at: string }
  | { type: "status"; status: ThreadStatus; at: string }
  | { type: "git"; action: "commit" | "pr" | "repo"; detail: string; at: string }
  | { type: "error"; message: string; at: string };

const id = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").toLowerCase();
const now = () => new Date().toISOString();

export class ThreadStore {
  readonly root: string;

  constructor(home = garryHome()) {
    this.root = home;
    mkdirSync(join(home, "threads"), { recursive: true, mode: 0o700 });
  }

  // ---- projects ----

  projects(): Project[] {
    const f = join(this.root, "projects.json");
    if (!existsSync(f)) return [];
    try {
      return (JSON.parse(readFileSync(f, "utf8")) as { projects: Project[] }).projects ?? [];
    } catch {
      return [];
    }
  }

  project(id: string): Project | undefined {
    return this.projects().find((p) => p.id === id);
  }

  /** The repositories of one Garry project. */
  projectsOf(garryProject: string): Project[] {
    return this.projects().filter((p) => (p.garryProject ?? "default") === garryProject);
  }

  /** Lets go of the repositories of a removed Garry project (they stay on disk); returns how many. */
  forgetProjectsOf(garryProject: string): number {
    const list = this.projects();
    const keep = list.filter((p) => (p.garryProject ?? "default") !== garryProject);
    if (keep.length !== list.length) this.write(join(this.root, "projects.json"), { projects: keep });
    return list.length - keep.length;
  }

  /** Registers a git repository (once; the same path returns the same project) in a Garry project. */
  addProject(path: string, name?: string, garryProject?: string): Project {
    const abs = resolve(path);
    if (!existsSync(join(abs, ".git"))) throw new Error(`${abs} is not a git repository`);
    const list = this.projects();
    const known = list.find((p) => p.path === abs);
    if (known) return known;
    const p: Project = { id: id(), name: (name ?? basename(abs)).slice(0, 64), path: abs, ...(garryProject && garryProject !== "default" ? { garryProject } : {}) };
    this.write(join(this.root, "projects.json"), { projects: [...list, p] });
    return p;
  }

  /** The project's settings, defaults filled in. */
  settings(projectId: string): ProjectSettings {
    const p = this.project(projectId);
    if (!p) throw new Error("unknown project");
    return settingsOf(p.settings);
  }

  /** Changes some settings (checked) and returns the whole. */
  saveSettings(projectId: string, input: unknown): ProjectSettings {
    const list = this.projects();
    const p = list.find((x) => x.id === projectId);
    if (!p) throw new Error("unknown project");
    p.settings = applySettings(settingsOf(p.settings), input);
    this.write(join(this.root, "projects.json"), { projects: list });
    return p.settings as ProjectSettings;
  }

  // ---- threads ----

  private dir(threadId: string): string {
    if (!/^[a-z0-9]{4,16}$/.test(threadId)) throw new Error("bad thread id");
    return join(this.root, "threads", threadId);
  }

  newId(): string {
    return id();
  }

  threads(projectId?: string): Thread[] {
    const dir = join(this.root, "threads");
    return readdirSync(dir)
      .map((d) => this.get(d))
      .filter((t): t is Thread => Boolean(t) && (!projectId || t!.projectId === projectId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(threadId: string): Thread | undefined {
    try {
      return JSON.parse(readFileSync(join(this.dir(threadId), "thread.json"), "utf8")) as Thread;
    } catch {
      return undefined;
    }
  }

  save(t: Thread): Thread {
    mkdirSync(this.dir(t.id), { recursive: true, mode: 0o700 });
    t.updatedAt = now();
    this.write(join(this.dir(t.id), "thread.json"), t);
    return t;
  }

  append(threadId: string, e: ThreadEvent): void {
    mkdirSync(this.dir(threadId), { recursive: true, mode: 0o700 });
    appendFileSync(join(this.dir(threadId), "events.jsonl"), JSON.stringify(e) + "\n");
  }

  events(threadId: string): ThreadEvent[] {
    const f = join(this.dir(threadId), "events.jsonl");
    if (!existsSync(f)) return [];
    return readFileSync(f, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as ThreadEvent);
  }

  private write(file: string, data: unknown): void {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, file);
  }
}

export { now };
