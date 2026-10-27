import type { ArchIssue, ArchSuggestion, Architecture, ArchitectureState, Feature, FileContent, FileEntry, GithubDeviceCode, GithubRepo, GithubStatus, LogEntry, RoutingProfile, RoutingProfiles, Stack, StackIssue, Stacks, Model, NewFeature, NewService, PairedDevice, Plan, Project, ProjectSettings, PullRequest, PushPreview, Registry, RegistryIssue, RegistryService, Routing, SkillSummary, StreamEvent, Task, Thread, ThreadDiff, ThreadEvent } from "./types";

/** A fetch with the standard signature; React Native passes expo/fetch for streaming. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** The server, for example http://192.168.1.20:8123. Empty means the page's own origin. */
  baseUrl: string;
  /** The device token from pairing; a browser on the server's own origin needs none. */
  token?: string | null;
  fetch?: FetchLike;
}

export class GarryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
  /** True when this device has to pair (again): its token is missing, wrong or revoked. */
  get unpaired(): boolean {
    return this.status === 401;
  }
}

/** Where a pairing link (QR code) points: the server, and the one-time code. */
export function parsePairingLink(link: string): { baseUrl: string; code: string } | null {
  try {
    const url = new URL(link.trim());
    const code = url.searchParams.get("code");
    if (!code || url.pathname !== "/pair" || !/^https?:$/.test(url.protocol)) return null;
    return { baseUrl: url.origin, code };
  } catch {
    return null;
  }
}

/** Trades a pairing code for this device's token. */
export async function pair(baseUrl: string, code: string, name: string, f: FetchLike = fetch): Promise<{ token: string; device: PairedDevice }> {
  const res = await f(`${baseUrl}/api/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; device?: PairedDevice; error?: string };
  if (!res.ok || !body.token || !body.device) throw new GarryError(body.error ?? `pairing failed (${res.status})`, res.status);
  return { token: body.token, device: body.device };
}

/** Parses a server sent events body into Garry stream events. */
export function parseStream(chunk: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  const blocks = chunk.split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    let name = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    const payload = data ? (JSON.parse(data) as Record<string, unknown>) : {};
    if (name === "feature") events.push({ type: "feature", ...(payload as { id: string; title: string; order: string[] }) });
    else if (name === "task") events.push({ type: "task", ...(payload as { index: number; task: Task; text: string }) });
    else if (name === "log") events.push({ type: "log", entry: payload as unknown as LogEntry });
    else if (name === "done") events.push({ type: "done" });
  }
  return { events, rest };
}

/** A typed client for one Garry server. */
export class GarryClient {
  private readonly base: string;
  private readonly f: FetchLike;

  constructor(private readonly opts: ClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, "");
    this.f = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return this.opts.token ? { authorization: `Bearer ${this.opts.token}`, ...extra } : extra;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.f(`${this.base}${path}`, { ...init, headers: this.headers((init.headers as Record<string, string>) ?? {}) });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new GarryError(body.error ?? `${path}: ${res.status}`, res.status);
    return body;
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  features = () => this.request<{ features: Feature[] }>("/api/features").then((r) => r.features);
  /** Creates a feature at the spec stage (features/FEAT-<n>-<slug>.md in the registry). */
  createFeature = (feature: NewFeature) => this.post<Feature>("/api/features", feature);
  /** Removes a feature (this computer only). */
  removeFeature = (id: string) => this.request<{ ok: true }>(`/api/features/${encodeURIComponent(id)}`, { method: "DELETE" });
  plan = (id: string) => this.request<Plan>(`/api/features/${encodeURIComponent(id)}/plan`);
  pullRequests = (id: string) => this.request<{ prs: PullRequest[] }>(`/api/features/${encodeURIComponent(id)}/prs`).then((r) => r.prs);
  registry = () => this.request<Registry>("/api/registry");
  /** The architecture board, every block Garry offers, your services as blocks, and what does not fit. */
  architecture = () => this.request<ArchitectureState>("/api/architecture");
  saveArchitecture = (a: Architecture) => this.post<{ architecture: Architecture; issues: ArchIssue[] }>("/api/architecture", a);
  /** Quick fixes from the rules; with ai, Garry's own suggestions too (Claude Code on the computer running Garry; can take a minute). */
  suggestArchitecture = (board: Architecture, goal = "", ai = false) =>
    this.post<{ quickFixes: ArchSuggestion[]; summary?: string; suggestions?: ArchSuggestion[]; error?: string }>("/api/architecture/suggest", { board, goal, ai });
  checkArchitecture = (a: Architecture) => this.post<{ issues: ArchIssue[] }>("/api/architecture/check", a).then((r) => r.issues);
  /** The stacks, Garry's technology catalog and its categories. */
  stacks = () => this.request<Stacks>("/api/stacks");
  /** What does not fit in a set of technology ids (nothing is saved). */
  checkStack = (technologies: string[]) => this.post<{ issues: StackIssue[] }>("/api/stacks/check", { technologies }).then((r) => r.issues);
  saveStack = (stack: Stack, replace = false) => this.post<{ stack: Stack; issues: StackIssue[] }>("/api/stacks", { ...stack, replace });
  /** Removes a stack (this computer only); refused while a service is built on it. */
  removeStack = (name: string) => this.request<{ ok: true }>(`/api/stacks/${encodeURIComponent(name)}`, { method: "DELETE" });
  /** Adds a service to the registry (catalog/<name>.yaml); issues is what the registry check says afterwards. */
  addService = (service: NewService) => this.post<{ service: RegistryService; issues: RegistryIssue[] }>("/api/registry/services", service);
  /** Removes a service (this computer only); refused while another service consumes it. */
  removeService = (name: string) => this.request<{ ok: true }>(`/api/registry/services/${encodeURIComponent(name)}`, { method: "DELETE" });
  skills = () => this.request<{ skills: SkillSummary[] }>("/api/skills").then((r) => r.skills);
  models = () => this.request<{ models: Model[] }>("/api/models").then((r) => r.models);
  routing = () => this.request<Routing>("/api/routing");
  setStageModel = (stage: string, model: string) => this.post<Routing>("/api/routing", { stage, model });
  /** Routing profiles: Garry's example and your own, and which one is active. */
  routingProfiles = () => this.request<RoutingProfiles>("/api/routings");
  /** Creates a profile, starting as a copy of `from` (default: Garry's example). */
  createRoutingProfile = (name: string, from = "default", description?: string) => this.post<RoutingProfile>("/api/routings", { name, from, description });
  /** Changes one stage (or "defaults") of a profile of your own. */
  setProfileRoute = (profile: string, stage: string, route: { model?: string; agent?: string }) => this.post<RoutingProfile>("/api/routing", { profile, stage, ...route });
  useRoutingProfile = (name: string) => this.post<RoutingProfiles>("/api/routings/active", { name });
  /** Removes a profile (this computer only). */
  removeRoutingProfile = (name: string) => this.request<RoutingProfiles>(`/api/routings/${encodeURIComponent(name)}`, { method: "DELETE" });
  setServiceModel = (featureId: string, service: string, model: string) =>
    this.post<{ ok: true; serviceModels: Record<string, string> }>(`/api/features/${encodeURIComponent(featureId)}/service-models`, { service, model });

  // ---- the IDE: projects and agent threads ----
  projects = () => this.request<{ projects: Project[] }>("/api/projects").then((r) => r.projects);
  /** Imports a GitHub repository (owner/name): cloned on this computer and added as a project. */
  importProject = (repo: string) => this.post<Project>("/api/projects/import", { repo });

  // ---- GitHub (this computer only) ----
  githubStatus = () => this.request<GithubStatus>("/api/github");
  /** Checks a personal access token with GitHub and keeps it for Garry. */
  connectGithubToken = (token: string) => this.post<{ login: string }>("/api/github/token", { token });
  /** Starts signing in with a code (needs GARRY_GITHUB_CLIENT_ID). */
  startGithubDevice = () => this.post<GithubDeviceCode>("/api/github/device", {});
  pollGithubDevice = (deviceCode: string) => this.post<{ status: "pending" | "slow_down" | "done" | "expired" | "denied"; login?: string }>("/api/github/device/poll", { deviceCode });
  disconnectGithub = () => this.request<{ ok: true }>("/api/github", { method: "DELETE" });
  githubRepos = (query = "") => this.request<{ repos: GithubRepo[] }>(`/api/github/repos?q=${encodeURIComponent(query)}`).then((r) => r.repos);
  threads = (projectId?: string) => this.request<{ threads: Thread[] }>(`/api/threads${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`).then((r) => r.threads);
  thread = (id: string) => this.request<{ thread: Thread; events: ThreadEvent[] }>(`/api/threads/${id}`);
  /** Starts work: a new branch and worktree in the project, and the agent's first turn. */
  createThread = (projectId: string, prompt: string, title?: string) => this.post<Thread>("/api/threads", { projectId, prompt, title });
  sendMessage = (id: string, text: string) => this.post<{ ok: true }>(`/api/threads/${id}/messages`, { text });
  stopThread = (id: string) => this.post<{ stopped: boolean }>(`/api/threads/${id}/stop`, {});
  threadDiff = (id: string) => this.request<ThreadDiff>(`/api/threads/${id}/diff`);
  commitThread = (id: string, message: string) => this.post<Thread>(`/api/threads/${id}/commit`, { message });
  /** Pushes and opens the PR. When the project asks before pushing, confirmed must be true (show pushPreview first), else 428. */
  openPullRequest = (id: string, title?: string, body?: string, confirmed = false) => this.post<Thread>(`/api/threads/${id}/pr`, { title, body, confirmed });
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

  /**
   * Follows a feature's live stream until it ends or the signal aborts. Needs a
   * fetch whose body is a ReadableStream (browsers, Node, expo/fetch).
   */
  async stream(id: string, onEvent: (e: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
    const res = await this.f(`${this.base}/api/features/${encodeURIComponent(id)}/stream`, { headers: this.headers({ accept: "text/event-stream" }), signal });
    if (!res.ok || !res.body) throw new GarryError(`stream: ${res.status}`, res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const { events, rest } = parseStream(buffer + decoder.decode(value, { stream: true }));
      buffer = rest;
      for (const e of events) onEvent(e);
    }
  }
}
