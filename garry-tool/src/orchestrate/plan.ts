import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { loadSkills, skillsForStage } from "./skillsManifest.js";
import { loadServices, delegationOrder } from "./graph.js";
import { resolveRouting, routeFor, type Route } from "./routing.js";
import type { Delegate, Task } from "./delegate.js";

export const STAGES = ["spec", "plan", "design", "implement", "review", "test", "integrate"] as const;
export type Stage = (typeof STAGES)[number];

const PER_SERVICE = new Set<string>(["implement", "review", "test"]);

export interface FeatureDoc {
  id: string;
  title: string;
  services: string[];
  contractChanges: string[];
  routingOverride?: Record<string, Route>;
}

/** Finds and reads a feature document by id from the registry. */
export function loadFeature(registry: string, id: string): FeatureDoc {
  const dir = join(registry, "features");
  if (!existsSync(dir)) throw new Error(`no features/ directory in registry: ${registry}`);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(dir, f), "utf8"));
    if (!m) continue;
    const fm = (parseYaml(m[1]) ?? {}) as Partial<FeatureDoc>;
    if (fm.id === id) {
      return {
        id,
        title: fm.title ?? id,
        services: fm.services ?? [],
        contractChanges: fm.contractChanges ?? [],
        routingOverride: fm.routingOverride,
      };
    }
  }
  throw new Error(`feature ${id} not found in ${dir}`);
}

export interface FeatureSummary {
  id: string;
  title: string;
  status: string;
  services: string[];
}

/** Lists all features in the registry with their summary frontmatter. */
export function listFeatures(registry: string): FeatureSummary[] {
  const dir = join(registry, "features");
  if (!existsSync(dir)) return [];
  const out: FeatureSummary[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(dir, f), "utf8"));
    if (!m) continue;
    const fm = (parseYaml(m[1]) ?? {}) as Partial<FeatureDoc> & { status?: string };
    if (fm.id) {
      out.push({
        id: fm.id,
        title: fm.title ?? fm.id,
        status: fm.status ?? "",
        services: fm.services ?? [],
      });
    }
  }
  return out;
}

export interface Plan {
  feature: FeatureDoc;
  order: string[];
  tasks: Task[];
}

export interface BuildPlanOptions {
  registry: string;
  skillsRoot: string;
  routingFile?: string;
  featureId: string;
  worktrees?: Record<string, string>;
}

/** Composes the SDLC pipeline into an ordered list of delegation tasks. */
export function buildPlan(opts: BuildPlanOptions): Plan {
  const feature = loadFeature(opts.registry, opts.featureId);
  const nodes = loadServices(opts.registry, feature.services);
  const order = delegationOrder(nodes);
  const routing = resolveRouting(opts.routingFile, feature.routingOverride);
  const allSkills = loadSkills(opts.skillsRoot);

  const tasks: Task[] = [];
  for (const stage of STAGES) {
    const skills = skillsForStage(allSkills, stage).map((s) => s.name);
    if (skills.length === 0) continue;
    const route = routeFor(routing, stage);

    if (PER_SERVICE.has(stage)) {
      for (const service of order) {
        tasks.push({
          stage,
          scope: "service",
          service,
          repo: opts.worktrees?.[service],
          agent: route.agent,
          model: route.model,
          skills,
        });
      }
    } else {
      tasks.push({ stage, scope: "global", agent: route.agent, model: route.model, skills });
    }
  }

  return { feature, order, tasks };
}

/** Runs every task through the delegate in order. */
export async function runPlan(plan: Plan, delegate: Delegate): Promise<void> {
  for (const task of plan.tasks) {
    await delegate.run(task);
  }
}
