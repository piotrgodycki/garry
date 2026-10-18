export interface Task {
  stage: string;
  scope: "global" | "service";
  service?: string;
  repo?: string;
  agent: string;
  model: string;
  skills: string[];
  /** project lessons injected into this task, so a known mistake is not repeated */
  lessons?: { id: string; rule: string }[];
}

export interface Delegate {
  run(task: Task): Promise<void> | void;
}

/** Describes a task in one readable block. */
export function describe(task: Task): string {
  const who = task.scope === "service" ? (task.service ?? "service") : "supervisor";
  const loc = task.repo ? `  (${task.repo})` : "";
  const lessons = task.lessons?.length ? `\n    lessons: ${task.lessons.map((l) => l.id).join(", ")}` : "";
  return `[${task.stage}] ${who} via ${task.agent}:${task.model}${loc}\n    skills: ${task.skills.join(", ") || "(none)"}${lessons}`;
}

/**
 * The default executor. It does not call a model. It logs exactly what it would
 * delegate, so the orchestration can be inspected and tested. The live executor
 * on the Claude Agent SDK is wired later.
 */
export class DryRunDelegate implements Delegate {
  run(task: Task): void {
    console.log(describe(task));
  }
}
