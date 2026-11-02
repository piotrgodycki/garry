import type {
  ArchIssue,
  ArchSuggestion,
  Architecture,
  ArchitectureState,
  Feature,
  RoutingProfile,
  RoutingProfiles,
  Stack,
  StackIssue,
  Stacks,
  Model,
  NewFeature,
  NewService,
  Plan,
  PullRequest,
  Registry,
  RegistryIssue,
  RegistryService,
  Routing,
  SkillSummary,
  Layer,
  Layers,
  LayerScope,
  AgentContext,
  StreamEvent,
  ServiceKindInfo,
  WizardAnswers,
} from "./types";
import { GarryError, parseStream } from "./connect";
import { HttpClient } from "./http";

export class RegistryClient extends HttpClient {
  features = () => this.request<{ features: Feature[] }>("/api/features").then((r) => r.features);
  /** Starts at the spec stage, as features/FEAT-<n>-<slug>.md in the registry. */
  createFeature = (feature: NewFeature) => this.post<Feature>("/api/features", feature);
  /** This computer only. */
  removeFeature = (id: string) => this.request<{ ok: true }>(`/api/features/${encodeURIComponent(id)}`, { method: "DELETE" });
  plan = (id: string) => this.request<Plan>(`/api/features/${encodeURIComponent(id)}/plan`);
  pullRequests = (id: string) => this.request<{ prs: PullRequest[] }>(`/api/features/${encodeURIComponent(id)}/prs`).then((r) => r.prs);
  registry = () => this.request<Registry>("/api/registry");
  architecture = (board = "") => this.request<ArchitectureState>(`/api/architecture${board ? `?board=${encodeURIComponent(board)}` : ""}`);
  saveArchitecture = (a: Architecture, board = "") =>
    this.post<{ architecture: Architecture; issues: ArchIssue[] }>(`/api/architecture${board ? `?board=${encodeURIComponent(board)}` : ""}`, a);
  /** This computer only. */
  resetArchitecture = (board = "") =>
    this.request<{ ok: true }>(`/api/architecture${board ? `?board=${encodeURIComponent(board)}` : ""}`, { method: "DELETE" });
  /** Nothing is saved. */
  wizardArchitecture = (answers: WizardAnswers) => this.post<{ architecture: Architecture; issues: ArchIssue[] }>("/api/architecture/wizard", { answers });
  /** With ai, Claude Code on the computer running Garry adds its own suggestions, which can take a minute. */
  suggestArchitecture = (board: Architecture, goal = "", ai = false) =>
    this.post<{ quickFixes: ArchSuggestion[]; summary?: string; suggestions?: ArchSuggestion[]; error?: string }>("/api/architecture/suggest", {
      board,
      goal,
      ai,
    });
  checkArchitecture = (a: Architecture) => this.post<{ issues: ArchIssue[] }>("/api/architecture/check", a).then((r) => r.issues);
  stacks = () => this.request<Stacks>("/api/stacks");
  /** Nothing is saved. */
  checkStack = (technologies: string[]) => this.post<{ issues: StackIssue[] }>("/api/stacks/check", { technologies }).then((r) => r.issues);
  saveStack = (stack: Stack, replace = false) => this.post<{ stack: Stack; issues: StackIssue[] }>("/api/stacks", { ...stack, replace });
  /** This computer only; refused while a service is built on it. */
  removeStack = (name: string) => this.request<{ ok: true }>(`/api/stacks/${encodeURIComponent(name)}`, { method: "DELETE" });
  serviceKinds = () => this.request<{ kinds: ServiceKindInfo[] }>("/api/service-kinds").then((r) => r.kinds);
  /** Writes catalog/<name>.yaml; issues is what the registry check says afterwards. */
  addService = (service: NewService) => this.post<{ service: RegistryService; issues: RegistryIssue[] }>("/api/registry/services", service);
  /** This computer only; refused while another service consumes it. */
  removeService = (name: string) => this.request<{ ok: true }>(`/api/registry/services/${encodeURIComponent(name)}`, { method: "DELETE" });
  skills = () => this.request<{ skills: SkillSummary[] }>("/api/skills").then((r) => r.skills);
  /** Off means the skill is given only where a layer turns it on. */
  setSkillEverywhere = (name: string, on: boolean) => this.post<{ ok: true }>(`/api/skills/${encodeURIComponent(name)}/everywhere`, { on });
  layers = () =>
    this.request<{
      layers: Layers;
      repos: { id: string; name: string }[];
      services: { name: string; repo: string; inRepo: string | null; stackRef: string | null }[];
    }>("/api/layers");
  saveLayer = (scope: LayerScope, layer: Layer) => this.post<{ layers: Layers; layer: Layer }>("/api/layers", { scope, layer });
  /** All layers added up. */
  agentContext = (repoId: string) => this.request<AgentContext>(`/api/layers/agent?repo=${encodeURIComponent(repoId)}`);
  models = () => this.request<{ models: Model[] }>("/api/models").then((r) => r.models);
  routing = () => this.request<Routing>("/api/routing");
  setStageModel = (stage: string, model: string) => this.post<Routing>("/api/routing", { stage, model });
  routingProfiles = () => this.request<RoutingProfiles>("/api/routings");
  /** Starts as a copy of `from`; "default" is Garry's example. */
  createRoutingProfile = (name: string, from = "default", description?: string) => this.post<RoutingProfile>("/api/routings", { name, from, description });
  /** stage may be "defaults"; Garry's example cannot be changed. */
  setProfileRoute = (profile: string, stage: string, route: { model?: string; agent?: string }) =>
    this.post<RoutingProfile>("/api/routing", { profile, stage, ...route });
  useRoutingProfile = (name: string) => this.post<RoutingProfiles>("/api/routings/active", { name });
  /** This computer only. */
  removeRoutingProfile = (name: string) => this.request<RoutingProfiles>(`/api/routings/${encodeURIComponent(name)}`, { method: "DELETE" });
  setServiceModel = (featureId: string, service: string, model: string) =>
    this.post<{ ok: true; serviceModels: Record<string, string> }>(`/api/features/${encodeURIComponent(featureId)}/service-models`, { service, model });

  /** Needs a fetch whose body is a ReadableStream (browsers, Node, expo/fetch). */
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
