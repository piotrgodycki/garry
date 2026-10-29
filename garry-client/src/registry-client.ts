import type { ArchIssue, ArchSuggestion, Architecture, ArchitectureState, Feature, RoutingProfile, RoutingProfiles, Stack, StackIssue, Stacks, Model, NewFeature, NewService, Plan, PullRequest, Registry, RegistryIssue, RegistryService, Routing, SkillSummary, Layer, Layers, LayerScope, AgentContext, StreamEvent, ServiceKindInfo, WizardAnswers } from "./types";
import { GarryError, parseStream } from "./connect";
import { HttpClient } from "./http";

/** What a project is made of: features and their plans, the registry, architecture, stacks, skills, layers and model routing. */
export class RegistryClient extends HttpClient {
  features = () => this.request<{ features: Feature[] }>("/api/features").then((r) => r.features);
  /** Creates a feature at the spec stage (features/FEAT-<n>-<slug>.md in the registry). */
  createFeature = (feature: NewFeature) => this.post<Feature>("/api/features", feature);
  /** Removes a feature (this computer only). */
  removeFeature = (id: string) => this.request<{ ok: true }>(`/api/features/${encodeURIComponent(id)}`, { method: "DELETE" });
  plan = (id: string) => this.request<Plan>(`/api/features/${encodeURIComponent(id)}/plan`);
  pullRequests = (id: string) => this.request<{ prs: PullRequest[] }>(`/api/features/${encodeURIComponent(id)}/prs`).then((r) => r.prs);
  registry = () => this.request<Registry>("/api/registry");
  /** The architecture board, every block Garry offers, your services as blocks, and what does not fit. */
  architecture = (board = "") => this.request<ArchitectureState>(`/api/architecture${board ? `?board=${encodeURIComponent(board)}` : ""}`);
  saveArchitecture = (a: Architecture, board = "") => this.post<{ architecture: Architecture; issues: ArchIssue[] }>(`/api/architecture${board ? `?board=${encodeURIComponent(board)}` : ""}`, a);
  /** Empties a board (this computer only). */
  resetArchitecture = (board = "") => this.request<{ ok: true }>(`/api/architecture${board ? `?board=${encodeURIComponent(board)}` : ""}`, { method: "DELETE" });
  /** The board the wizard's answers make (nothing is saved). */
  wizardArchitecture = (answers: WizardAnswers) => this.post<{ architecture: Architecture; issues: ArchIssue[] }>("/api/architecture/wizard", { answers });
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
  /** The kinds of service a registry holds (microfrontend, SPA, API, BFF, worker...). */
  serviceKinds = () => this.request<{ kinds: ServiceKindInfo[] }>("/api/service-kinds").then((r) => r.kinds);
  /** Adds a service to the registry (catalog/<name>.yaml); issues is what the registry check says afterwards. */
  addService = (service: NewService) => this.post<{ service: RegistryService; issues: RegistryIssue[] }>("/api/registry/services", service);
  /** Removes a service (this computer only); refused while another service consumes it. */
  removeService = (name: string) => this.request<{ ok: true }>(`/api/registry/services/${encodeURIComponent(name)}`, { method: "DELETE" });
  skills = () => this.request<{ skills: SkillSummary[] }>("/api/skills").then((r) => r.skills);
  /** Gives a local skill to every project's agents, or only where a layer turns it on. */
  setSkillEverywhere = (name: string, on: boolean) => this.post<{ ok: true }>(`/api/skills/${encodeURIComponent(name)}/everywhere`, { on });
  /** The layers of the active project, with its repositories and services to set them for. */
  layers = () => this.request<{ layers: Layers; repos: { id: string; name: string }[]; services: { name: string; repo: string; inRepo: string | null; stackRef: string | null }[] }>("/api/layers");
  saveLayer = (scope: LayerScope, layer: Layer) => this.post<{ layers: Layers; layer: Layer }>("/api/layers", { scope, layer });
  /** What an agent in one repository gets, all layers added up. */
  agentContext = (repoId: string) => this.request<AgentContext>(`/api/layers/agent?repo=${encodeURIComponent(repoId)}`);
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
