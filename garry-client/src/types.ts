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
}

export interface Route {
  agent: string;
  model: string;
}

export interface Routing {
  defaults: Route | null;
  stages: Record<string, Route>;
}

export interface SkillSummary {
  name: string;
  stage: string;
  summary: string;
  source: "builtin" | "local";
  hasDoc: boolean;
  audit: { verdict: "pass" | "warn" | "fail"; counts: Record<string, number> } | null;
}

export interface RegistryService {
  name: string;
  repo?: string;
  stack?: string;
  owner?: string;
  exposes: string[];
  consumes: Record<string, string[]>;
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
