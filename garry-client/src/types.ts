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

/** One step an agent took, as the live stream reports it. */
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
}

export type ServiceKind = "mfe-remote" | "mfe-shell" | "spa" | "ssr" | "isr" | "ssg" | "mobile" | "backend" | "bff" | "worker" | "function";

/** A kind of service: what it is, what it exposes, whether it may own a database, and the stack it starts from. */
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

/** One entry of a worktree folder (files are opened and edited on the computer running Garry only). */
/** A shell opened from the Files tab on the computer running Garry. */
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

/** A technology in Garry's catalog. */
export interface CatalogTech {
  id: string;
  name: string;
  category: string;
  requires?: string[][];
  conflicts?: string[];
  /** for rendering and performance: where it happens */
  side?: "server" | "client";
  note?: string;
}

export interface Stacks {
  stacks: (Stack & { usedBy: string[]; issues: StackIssue[] })[];
  catalog: CatalogTech[];
  categories: { id: string; label: string; single?: boolean }[];
  /** ready-made stacks to start from (MERN, Jamstack, Expo...) */
  templates: StackTemplate[];
}

/** A ready-made stack: a known combination, and the kinds of service it suits. */
export interface StackTemplate {
  name: string;
  title: string;
  description: string;
  kinds: ServiceKind[];
  technologies: { id: string }[];
}

/** A block on the architecture board: a platform piece or one of your services (service:<name>). */
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

/** The architecture wizard's answers. */
export interface WizardAnswers {
  clients: ("web" | "ios" | "android")[];
  platform: "vercel" | "cloudflare" | "aws" | "supabase" | "self-hosted" | "kubernetes";
  data: "sql" | "document" | "none";
  extras: ("auth" | "cms" | "files" | "queue" | "cache" | "search" | "email" | "cdn" | "events")[];
  services: boolean;
}

/** One question of the wizard: its title and its choices. */
export interface WizardQuestion {
  title: string;
  choices: { id: string; label: string; hint: string }[];
}

/** A board: the whole project's (id "") or a repository's (id = its name). */
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

/** A change to the board: blocks to add (referred to as new:<index> in links) and links to make. */
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
  /** ready-made architectures to start from */
  templates: ArchTemplate[];
  /** the board shown ("" the whole project's) and every board there is */
  board: string;
  boards: ArchBoard[];
  /** the wizard's questions */
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
  /** contract files it changes, e.g. events.json */
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
  /** the database it owns, for kinds that may own one */
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

// ---- Garry at a glance ----
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

// ---- Live: every agent as a lane on a timeline ----
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

// ---- Talking to Garry: messages in line, one at a time ----
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

// ---- Garry projects ----
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
}
export interface GarryProjects {
  active: string;
  /** the registry the server reads now */
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

// ---- GitHub ----
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

// ---- the IDE: projects and agent threads ----

/** What Garry may do with a project's remote. */
export interface ProjectSettings {
  /** ask: confirm every push; allow: push when opening a PR; never: no pushes from Garry */
  push: "ask" | "allow" | "never";
  /** the branch pull requests target; empty is the repository's default branch */
  baseBranch: string;
  branchPrefix: string;
  /** branches Garry never pushes to; * matches anything */
  protectedBranches: string[];
  draftPr: boolean;
}

export interface PushPreview {
  branch: string;
  remote: string | null;
  base: string;
  commits: { sha: string; subject: string }[];
  mode: ProjectSettings["push"];
  draft: boolean;
  /** why the push would be refused, if it would */
  refused: string | null;
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
  /** what it needs from you: the same reading as the menu bar */
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
  | { type: "git"; action: "commit" | "pr"; detail: string; at: string }
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
