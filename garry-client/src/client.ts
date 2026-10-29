import type { FileContent, FileEntry, GarryBundle, GarryStatus, GarryProject, GarryMessage, GarryQueue, LiveView, Pair, Chain, GarryProjects, GithubDeviceCode, GithubRepo, GithubStatus, Project, ProjectSettings, PushPreview, GarryCommand, MemoryEntry, Thread, TerminalInfo, ThreadDiff, ThreadEvent } from "./types";
import { GarryError } from "./connect";
import { RegistryClient } from "./registry-client";
/** A typed client for one Garry server: the registry (RegistryClient), and the work: projects, agents, Garry, GitHub, files, terminals. */
export class GarryClient extends RegistryClient {
  /** The commands that can follow a slash in Garry's field. */
  garryCommands = () => this.request<{ commands: GarryCommand[] }>("/api/garry/commands").then((r) => r.commands);
  /** Runs "/name args" at once; open is a page to go to, when the command leads somewhere. */
  runGarryCommand = (text: string) => this.post<{ message: string; open?: string }>("/api/garry/commands", { text });
  /** What Garry and every agent in the active project keep in mind. */
  garryMemory = () => this.request<{ entries: MemoryEntry[] }>("/api/garry/memory").then((r) => r.entries);
  remember = (text: string) => this.post<MemoryEntry>("/api/garry/memory", { text });
  forget = (id: string) => this.request<MemoryEntry>(`/api/garry/memory/${encodeURIComponent(id)}`, { method: "DELETE" });
  // ---- the IDE: projects and agent threads ----
  projects = () => this.request<{ projects: Project[] }>("/api/projects").then((r) => r.projects);
  /** Imports a GitHub repository (owner/name): cloned on this computer and added as a project. */
  importProject = (repo: string) => this.post<Project>("/api/projects/import", { repo });

  // ---- Garry at a glance: working, needs you, ready (the menu bar, the phone) ----
  status = () => this.request<GarryStatus>("/api/status");
  /** A paired phone asks to be notified (an Expo push token), or stops (null). */
  setPushToken = (token: string | null) => this.post<{ ok: true; notifications: boolean; enabled: boolean }>("/api/push/token", { token });

  // ---- Garry projects: everything one product is made of ----
  garryProjects = () => this.request<GarryProjects>("/api/garry-projects");
  createGarryProject = (name: string, description?: string) => this.post<GarryProject>("/api/garry-projects", { name, description });
  /** Switches the project in use; the registry and the repositories follow. */
  useGarryProject = (id: string) => this.post<GarryProjects>("/api/garry-projects/active", { id });
  updateGarryProject = (id: string, patch: { name?: string; description?: string }) => this.post<GarryProject>(`/api/garry-projects/${encodeURIComponent(id)}`, patch);
  removeGarryProject = (id: string) => this.request<GarryProjects>(`/api/garry-projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  /** The project as one .garry.json file (registry files, repositories as remotes; never tokens). */
  exportGarryProject = (id: string) => this.request<GarryBundle>(`/api/garry-projects/${encodeURIComponent(id)}/export`);
  importGarryProject = (bundle: unknown) => this.post<GarryProject>("/api/garry-projects/import", bundle);
  /** Clones a repository an imported project names (GitHub only). */
  clonePendingRepo = (id: string, remote: string) => this.post<Project>(`/api/garry-projects/${encodeURIComponent(id)}/repos/clone`, { remote });

  // ---- GitHub (this computer only) ----
  githubStatus = () => this.request<GithubStatus>("/api/github");
  /** Checks a personal access token with GitHub and keeps it for Garry. */
  connectGithubToken = (token: string) => this.post<{ login: string }>("/api/github/token", { token });
  /** Starts signing in with a code (needs GARRY_GITHUB_CLIENT_ID). */
  startGithubDevice = () => this.post<GithubDeviceCode>("/api/github/device", {});
  pollGithubDevice = (deviceCode: string) => this.post<{ status: "pending" | "slow_down" | "done" | "expired" | "denied"; login?: string }>("/api/github/device/poll", { deviceCode });
  disconnectGithub = () => this.request<{ ok: true }>("/api/github", { method: "DELETE" });
  githubRepos = (query = "") => this.request<{ repos: GithubRepo[] }>(`/api/github/repos?q=${encodeURIComponent(query)}`).then((r) => r.repos);
  /** Agents working together in the active project: pairs (writer and reviewer) and chains (steps in order). */
  teams = () => this.request<{ pairs: Pair[]; chains: Chain[] }>("/api/teams");
  /** A writer starts on the task; a reviewer looks after each of its turns, up to rounds times. */
  startPair = (task: string, projectId?: string, rounds?: number) => this.post<Pair>("/api/pairs", { task, projectId, rounds });
  /** Steps in order, each its own agent in one working copy; after: begin once that work is done. */
  startChain = (steps: string[], opts: { name?: string; projectId?: string; after?: string } = {}) => this.post<Chain>("/api/chains", { steps, ...opts });
  addChainStep = (id: string, prompt: string) => this.post<Chain>(`/api/chains/${id}/steps`, { prompt });
  reorderChain = (id: string, order: string[]) => this.post<Chain>(`/api/chains/${id}/order`, { order });
  dropChainStep = (id: string, step: string) => this.request<Chain>(`/api/chains/${id}/steps/${step}`, { method: "DELETE" });
  stopChain = (id: string) => this.post<Chain>(`/api/chains/${id}/stop`, {});
  /** What you told Garry, in line (one at a time), and where a message can go. */
  garryQueue = () => this.request<GarryQueue>("/api/garry/queue");
  /** Puts a message in line for Garry; it starts when the work before it is done. */
  tellGarry = (text: string, projectId?: string) => this.post<GarryMessage>("/api/garry/queue", { text, projectId });
  /** Drops a message that has not started. */
  dropMessage = (id: string) => this.request<{ cancelled: boolean }>(`/api/garry/queue/${id}`, { method: "DELETE" });
  /** Live: every agent of the active project as a lane; finished ones from the last `hours`. */
  live = (hours = 24) => this.request<LiveView>(`/api/live?hours=${hours}`);
  threads = (projectId?: string) => this.request<{ threads: Thread[] }>(`/api/threads${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`).then((r) => r.threads);
  thread = (id: string) => this.request<{ thread: Thread; events: ThreadEvent[] }>(`/api/threads/${id}`);
  /** Starts work: a new branch and worktree in the project, and the agent's first turn. */
  createThread = (projectId: string, prompt: string, title?: string) => this.post<Thread>("/api/threads", { projectId, prompt, title });
  sendMessage = (id: string, text: string) => this.post<{ ok: true }>(`/api/threads/${id}/messages`, { text });
  stopThread = (id: string) => this.post<{ stopped: boolean }>(`/api/threads/${id}/stop`, {});
  threadDiff = (id: string) => this.request<ThreadDiff>(`/api/threads/${id}/diff`);
  commitThread = (id: string, message: string) => this.post<Thread>(`/api/threads/${id}/commit`, { message });
  /** Pushes and opens the PR. When the project asks before pushing, confirmed must be true (show pushPreview first), else 428. */
  /** A repository's home on GitHub: where it is, or what Garry would create (named as in Garry). */
  githubRepo = (projectId: string) => this.request<{ remote: string | null; create: { owner: string; name: string } | null }>(`/api/projects/${projectId}/github-repo`);
  /** Creates the repository on GitHub, adds it as origin and pushes the current branch (this computer only). */
  createGithubRepo = (projectId: string, opts: { owner?: string; name?: string; private?: boolean } = {}) => this.post<{ owner: string; name: string; url: string; pushed: string | null }>(`/api/projects/${projectId}/github-repo`, opts);
  /** create: the GitHub repository to make first, named as in Garry, when the project has none (your yes to it) */
  openPullRequest = (id: string, title?: string, body?: string, confirmed = false, create?: { owner?: string; name?: string; private?: boolean }) => this.post<Thread>(`/api/threads/${id}/pr`, { title, body, confirmed, create });
  /** What a push would do: branch, remote, base, commits, and whether the project allows it. */
  pushPreview = (id: string) => this.request<PushPreview>(`/api/threads/${id}/push`);
  projectSettings = (projectId: string) => this.request<ProjectSettings>(`/api/projects/${projectId}/settings`);
  /** Changes some of a project's settings (this computer only). */
  saveProjectSettings = (projectId: string, settings: Partial<ProjectSettings>) => this.post<ProjectSettings>(`/api/projects/${projectId}/settings`, settings);
  /**
   * Files under one root, this computer only: a thread's worktree
   * (/api/threads/:id), a project's checkout (/api/projects/:id) or the
   * registry (/api/registry). One folder at a time.
   */
  listFiles = (root: string, path = "") => this.request<{ path: string; entries: FileEntry[] }>(`${root}/files?path=${encodeURIComponent(path)}`).then((r) => r.entries);
  readFile = (root: string, path: string) => this.request<FileContent>(`${root}/file?path=${encodeURIComponent(path)}`);
  /** Saves a file by hand; with sha, refused (409) when the file changed since it was read. */
  writeFile = (root: string, path: string, content: string, sha?: string) => this.post<FileContent>(`${root}/file`, { path, content, sha });
  threadFiles = (id: string, path = "") => this.listFiles(`/api/threads/${id}`, path);
  readThreadFile = (id: string, path: string) => this.readFile(`/api/threads/${id}`, path);
  writeThreadFile = (id: string, path: string, content: string, sha?: string) => this.writeFile(`/api/threads/${id}`, path, content, sha);

  // ---- terminals (the Files tab; the computer running Garry only) ----
  /** Open terminals, and whether this computer allows them (GARRY_TERMINAL=off). */
  terminals = () => this.request<{ enabled: boolean; terminals: TerminalInfo[] }>("/api/terminals");
  /** Opens a shell in a root: "registry", "project:<id>" or "thread:<id>". */
  openTerminal = (root: string, cols?: number, rows?: number) => this.post<TerminalInfo>("/api/terminals", { root, cols, rows });
  terminalInput = (id: string, data: string) => this.post<{ ok: true }>(`/api/terminals/${id}/input`, { data });
  resizeTerminal = (id: string, cols: number, rows: number) => this.post<{ ok: true }>(`/api/terminals/${id}/resize`, { cols, rows });
  closeTerminal = (id: string) => this.request<{ ok: true }>(`/api/terminals/${id}`, { method: "DELETE" });

  /** Follows a terminal: what it printed so far, then each new piece, until it exits or the signal aborts. */
  async followTerminal(id: string, onData: (data: string) => void, signal?: AbortSignal): Promise<{ code: number | null } | null> {
    const res = await this.f(`${this.base}/api/terminals/${id}/stream`, { headers: this.headers({ accept: "text/event-stream" }), signal });
    if (!res.ok || !res.body) throw new GarryError(`terminal: ${res.status}`, res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return null;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const b of blocks) {
        const data = b.split("\n").find((l) => l.startsWith("data:"))?.slice(5).trim();
        if (!data) continue;
        if (b.startsWith("event: exit")) return JSON.parse(data) as { code: number | null };
        onData(JSON.parse(data) as string);
      }
    }
  }

  /** Follows a thread: every event so far, then each new one, until the signal aborts. */
  async threadEvents(id: string, onEvent: (e: ThreadEvent) => void, signal?: AbortSignal): Promise<void> {
    const res = await this.f(`${this.base}/api/threads/${id}/events`, { headers: this.headers({ accept: "text/event-stream" }), signal });
    if (!res.ok || !res.body) throw new GarryError(`thread events: ${res.status}`, res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const b of blocks) {
        const data = b
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("");
        if (data) onEvent(JSON.parse(data) as ThreadEvent);
      }
    }
  }
}
