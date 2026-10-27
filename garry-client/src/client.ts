import type { Feature, LogEntry, Model, PairedDevice, Plan, Project, PullRequest, Registry, Routing, SkillSummary, StreamEvent, Task, Thread, ThreadDiff, ThreadEvent } from "./types";

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
  plan = (id: string) => this.request<Plan>(`/api/features/${encodeURIComponent(id)}/plan`);
  pullRequests = (id: string) => this.request<{ prs: PullRequest[] }>(`/api/features/${encodeURIComponent(id)}/prs`).then((r) => r.prs);
  registry = () => this.request<Registry>("/api/registry");
  skills = () => this.request<{ skills: SkillSummary[] }>("/api/skills").then((r) => r.skills);
  models = () => this.request<{ models: Model[] }>("/api/models").then((r) => r.models);
  routing = () => this.request<Routing>("/api/routing");
  setStageModel = (stage: string, model: string) => this.post<Routing>("/api/routing", { stage, model });
  setServiceModel = (featureId: string, service: string, model: string) =>
    this.post<{ ok: true; serviceModels: Record<string, string> }>(`/api/features/${encodeURIComponent(featureId)}/service-models`, { service, model });

  // ---- the IDE: projects and agent threads ----
  projects = () => this.request<{ projects: Project[] }>("/api/projects").then((r) => r.projects);
  threads = (projectId?: string) => this.request<{ threads: Thread[] }>(`/api/threads${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`).then((r) => r.threads);
  thread = (id: string) => this.request<{ thread: Thread; events: ThreadEvent[] }>(`/api/threads/${id}`);
  /** Starts work: a new branch and worktree in the project, and the agent's first turn. */
  createThread = (projectId: string, prompt: string, title?: string) => this.post<Thread>("/api/threads", { projectId, prompt, title });
  sendMessage = (id: string, text: string) => this.post<{ ok: true }>(`/api/threads/${id}/messages`, { text });
  stopThread = (id: string) => this.post<{ stopped: boolean }>(`/api/threads/${id}/stop`, {});
  threadDiff = (id: string) => this.request<ThreadDiff>(`/api/threads/${id}/diff`);
  commitThread = (id: string, message: string) => this.post<Thread>(`/api/threads/${id}/commit`, { message });
  openPullRequest = (id: string, title?: string, body?: string) => this.post<Thread>(`/api/threads/${id}/pr`, { title, body });

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
