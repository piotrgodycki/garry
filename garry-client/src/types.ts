// Shapes the Garry server returns (garry-tool/src/server/server.ts).

export type Stage = "spec" | "plan" | "design" | "implement" | "review" | "test" | "integrate";

export interface Feature {
  id: string;
  title: string;
  status: string;
  services: string[];
}

export interface Task {
  stage: string;
  scope: "global" | "service";
  service?: string;
  agent: string;
  model: string;
  skills: string[];
}

export interface Plan {
  feature: { id: string; title: string; status?: string; services?: string[]; contractChanges?: string[] };
  order: string[];
  tasks: Task[];
}

export interface LogEntry {
  index: number;
  stage: string;
  who: string;
  agent: string;
  model: string;
  skill: string;
  action: string;
}

export type StreamEvent =
  | { type: "feature"; id: string; title: string; order: string[] }
  | { type: "task"; index: number; task: Task; text: string }
  | { type: "log"; entry: LogEntry }
  | { type: "done" };

export interface PullRequest {
  service: string;
  branch: string;
  repo: string;
  url: string;
  state: string;
  checks: string;
  live: boolean;
}

export interface Model {
  id: string;
  label: string;
  /** An earlier generation, offered only where it is already chosen. */
  previous?: boolean;
}

export interface Route {
  agent: string;
  model: string;
}

export interface Routing {
  defaults: Route | null;
  stages: Record<string, Route>;
}

/** A routing profile: "default" is Garry's example (read only); the rest are your own. */
export interface RoutingProfile {
  name: string;
  description?: string;
  defaults: Route;
  stages: Record<string, Route>;
  builtin?: boolean;
}

export interface RoutingProfiles {
  active: string;
  profiles: RoutingProfile[];
}

export interface SkillSummary {
  name: string;
  stage: string;
  summary: string;
  source: "builtin" | "local";
  hasDoc: boolean;
  audit: { verdict: "pass" | "warn" | "fail"; counts: Record<string, number> } | null;
  /** given to agents in every project; otherwise only where a layer turns it on */
  everywhere?: boolean;
}

export interface Layer {
  skills: string[];
  skillsOff: string[];
  stacks: string[];
  notes: string;
}

export interface Layers {
  project: Layer;
  repos: Record<string, Layer>;
  services: Record<string, Layer>;
}

export type LayerScope = { level: "project" } | { level: "repo" | "service"; name: string };

/** "everywhere", "project", "repo:<name>" or "service:<name>". */
export type LayerFrom = string;

export interface AgentContext {
  repo: string;
  services: string[];
  skills: { name: string; from: LayerFrom }[];
  stacks: { name: string; from: LayerFrom }[];
  notes: { from: LayerFrom; text: string }[];
  boards: string[];
  missing: string[];
  prompt: string;
  dirs: string[];
}

export type ServiceKind = "mfe-remote" | "mfe-shell" | "spa" | "ssr" | "isr" | "ssg" | "mobile" | "backend" | "bff" | "worker" | "function";

export interface ServiceKindInfo {
  id: ServiceKind;
  label: string;
  group: "Frontend" | "Backend";
  hint: string;
  exposes: { label: string; placeholder: string } | null;
  db: boolean;
  stack: string;
}

export interface RegistryService {
  name: string;
  kind?: ServiceKind;
  stackRef?: string;
  repo?: string;
  stack?: string;
  owner?: string;
  exposes: string[];
  consumes: Record<string, string[]>;
}

export interface TerminalInfo {
  id: string;
  /** "registry", "project:<id>" or "thread:<id>" */
  root: string;
  cwd: string;
  shell: string;
  createdAt: string;
  exited: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number;
}

export interface FileContent {
  path: string;
  /** null for a binary or too large file */
  content: string | null;
  size: number;
  /** what was on disk when read; sent back on save */
  sha: string;
  reason?: "binary" | "too large";
}

export interface StackTech {
  id: string;
  version?: string;
}

export interface Stack {
  name: string;
  description?: string;
  technologies: StackTech[];
}

export interface StackIssue {
  level: "error" | "warn" | "info";
  tech?: string;
  message: string;
}

export interface CatalogTech {
  id: string;
  name: string;
  category: string;
  requires?: string[][];
  conflicts?: string[];
  /** where it renders or runs */
  side?: "server" | "client";
  note?: string;
}

export interface Stacks {
  stacks: (Stack & { usedBy: string[]; issues: StackIssue[] })[];
  catalog: CatalogTech[];
  categories: { id: string; label: string; single?: boolean }[];
  templates: StackTemplate[];
}

export interface StackTemplate {
  name: string;
  title: string;
  description: string;
  kinds: ServiceKind[];
  technologies: { id: string }[];
}

/** A platform piece, or one of your services as service:<name>. */
export interface ArchBlock {
  id: string;
  name: string;
  provider: string;
  group: string;
  provides: string[];
  needs?: string[];
  reachableFrom?: string[];
  note?: string;
}

export interface ArchNode {
  id: string;
  block: string;
  label?: string;
  x: number;
  y: number;
}

/** A link goes from the block that needs to the block that provides. */
export interface ArchEdge {
  from: string;
  to: string;
  capability: string;
}

export interface Architecture {
  nodes: ArchNode[];
  edges: ArchEdge[];
  /** the wizard's answers the board was built from; null clears them */
  wizard?: WizardAnswers | null;
}

export interface WizardAnswers {
  clients: ("web" | "ios" | "android")[];
  platform: "vercel" | "cloudflare" | "aws" | "supabase" | "self-hosted" | "kubernetes";
  data: "sql" | "document" | "none";
  extras: ("auth" | "cms" | "files" | "queue" | "cache" | "search" | "email" | "cdn" | "events")[];
  services: boolean;
}

export interface WizardQuestion {
  title: string;
  choices: { id: string; label: string; hint: string }[];
}

/** id is "" for the whole project's board, else the repository's name. */
export interface ArchBoard {
  id: string;
  name: string;
  blocks: number;
}

export interface ArchIssue {
  level: "error" | "warn" | "info";
  node?: string;
  edge?: number;
  message: string;
}

/** Links refer to added blocks as new:<index>. */
export interface ArchSuggestion {
  title: string;
  why: string;
  add: { block: string; label?: string }[];
  links: ArchEdge[];
}

export interface ArchitectureState {
  architecture: Architecture;
  components: ArchBlock[];
  services: ArchBlock[];
  capabilities: Record<string, string>;
  providers: string[];
  issues: ArchIssue[];
  templates: ArchTemplate[];
  /** "" is the whole project's board */
  board: string;
  boards: ArchBoard[];
  wizard: Record<"clients" | "platform" | "data" | "extras", WizardQuestion>;
}

export interface ArchTemplate {
  id: string;
  name: string;
  summary: string;
  goodFor: string;
  architecture: Architecture;
}

export interface NewFeature {
  title: string;
  /** what it should do and why; becomes the Goal section */
  goal?: string;
  services?: string[];
  contractChanges?: string[];
  /** a routing profile; empty uses the active one */
  routing?: string;
}

export interface NewService {
  name: string;
  kind: ServiceKind;
  repo: string;
  owner?: string;
  stack?: string;
  /** a stack from stacks/; fills stack when that is empty */
  stackRef?: string;
  exposes?: string[];
  consumes?: Record<string, string[]>;
  db?: { engine: string; name?: string } | null;
}

export interface RegistryIssue {
  level: "error" | "warn";
  where: string;
  message: string;
}

export interface Registry {
  services: RegistryService[];
  contracts: Record<string, unknown>;
}

export interface PairedDevice {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface GarryStatusItem {
  threadId: string;
  title: string;
  projectId: string;
  state: "working" | "needs-you" | "done";
  detail: string;
  at: string;
}
export interface GarryStatus {
  state: "idle" | "working" | "needs-you" | "done";
  counts: { needsYou: number; working: number; done: number };
  items: GarryStatusItem[];
}

export type LiveState = "work" | "wait" | "fail" | "done";
export interface LiveSegment {
  state: LiveState;
  from: string;
  /** null while it still goes on */
  to: string | null;
  label: string;
}
export interface LiveLane {
  threadId: string;
  title: string;
  projectId: string;
  project: string;
  /** null once shipped (committed or a pull request) */
  state: LiveState | null;
  segments: LiveSegment[];
  costUsd: number;
  turns: number;
  tools: number;
  doing: string | null;
  role?: "reviewer" | "step";
  startedAt: string;
  updatedAt: string;
}
export interface LiveAsk {
  threadId: string;
  title: string;
  project: string;
  kind: "question" | "stopped";
  text: string;
  at: string;
}
export interface LiveView {
  now: string;
  lanes: LiveLane[];
  needsYou: LiveAsk[];
  spentToday: number;
}

export interface GarryMessage {
  id: string;
  text: string;
  projectId: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  threadId?: string;
  reply?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}
export interface GarryQueue {
  items: GarryMessage[];
  /** where a message can go: the project's repositories */
  repos: { id: string; name: string }[];
}

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

export interface PendingRepo {
  name: string;
  remote: string;
  settings?: Partial<ProjectSettings>;
}
export interface GarryProject {
  id: string;
  name: string;
  description?: string;
  path: string;
  createdAt: string;
  /** repositories an imported project names that are not cloned here yet */
  pendingRepos?: PendingRepo[];
  repos?: { id: string; name: string }[];
  /** the GitHub owner most of its repositories live under, and that owner's avatar */
  owner?: string;
  avatar?: string;
}
export interface GarryProjects {
  active: string;
  registry: string;
  projects: GarryProject[];
}
export interface GarryBundle {
  format: "garry-project";
  version: number;
  name: string;
  description?: string;
  exportedAt: string;
  files: Record<string, string>;
  repos: PendingRepo[];
}

export interface GithubStatus {
  connected: boolean;
  /** where the token comes from: .env.local, connected in Garry, or the GitHub CLI */
  source?: "env" | "garry" | "gh";
  login?: string;
  /** signing in with a code is available (GARRY_GITHUB_CLIENT_ID is set) */
  deviceFlow: boolean;
  error?: string;
}
export interface GithubDeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}
export interface GithubRepo {
  fullName: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  cloneUrl: string;
}

export interface ProjectSettings {
  /** ask: confirm every push; allow: push when opening a PR; never: no pushes from Garry */
  push: "ask" | "allow" | "never";
  /** the branch pull requests target; empty is the repository's default branch */
  baseBranch: string;
  branchPrefix: string;
  /** branches Garry never pushes to; * matches anything */
  protectedBranches: string[];
  draftPr: boolean;
  /** a commit with a file over this many tokens (bytes / 4) is refused; 0 turns it off */
  maxFileTokens: number;
}

export interface PushPreview {
  branch: string;
  remote: string | null;
  base: string;
  commits: { sha: string; subject: string }[];
  mode: ProjectSettings["push"];
  draft: boolean;
  refused: string | null;
  /** with no GitHub remote: the repository Garry would create once you say yes */
  create: { owner: string; name: string } | null;
}

export interface Project {
  id: string;
  name: string;
  path: string;
}

export type ThreadStatus = "running" | "idle" | "error";

export interface Thread {
  id: string;
  projectId: string;
  title: string;
  status: ThreadStatus;
  branch: string;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
  running?: boolean;
  /** the same reading as the menu bar */
  attention?: "working" | "needs-you" | "done" | null;
  /** in one line: what the agent is doing now, what it asks, or that it is ready */
  activity?: string | null;
  commit?: string;
  pr?: { number: number; url: string };
}

export type ThreadEvent =
  | { type: "user"; text: string; at: string }
  | { type: "text"; text: string; at: string }
  | { type: "tool"; id: string; name: string; summary: string; at: string }
  | { type: "tool_result"; id: string; ok: boolean; preview: string; at: string }
  | { type: "turn_end"; ok: boolean; costUsd?: number; at: string }
  | { type: "status"; status: ThreadStatus; at: string }
  | { type: "git"; action: "commit" | "pr" | "repo"; detail: string; at: string }
  | { type: "error"; message: string; at: string };

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
}

export interface ThreadDiff {
  files: FileChange[];
  patch: string;
  /** changes not committed yet; the diff also shows committed ones */
  uncommitted: boolean;
}

export interface GarryCommand {
  name: string;
  /** what goes after it; empty when nothing does */
  args: string;
  help: string;
}

export interface MemoryEntry {
  id: string;
  text: string;
  createdAt: string;
}
