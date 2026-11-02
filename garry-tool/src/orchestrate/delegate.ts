export interface Task {
  stage: string;
  scope: "global" | "service";
  service?: string;
  repo?: string;
  agent: string;
  model: string;
  skills: string[];
}

export interface Delegate {
  run(task: Task): Promise<void> | void;
}

export function describe(task: Task): string {
  const who = task.scope === "service" ? (task.service ?? "service") : "supervisor";
  const loc = task.repo ? `  (${task.repo})` : "";
  return `[${task.stage}] ${who} via ${task.agent}:${task.model}${loc}\n    skills: ${task.skills.join(", ") || "(none)"}`;
}

/** Logs what it would delegate instead of calling a model, so orchestration can be inspected and tested. */
export class DryRunDelegate implements Delegate {
  run(task: Task): void {
    console.log(describe(task));
  }
}
