import { resolve, join } from "node:path";
import { defaultRegistry, defaultSkillsRoot } from "../paths.js";
import { existsSync } from "node:fs";
import pc from "picocolors";
import { renderBanner, tagline } from "../ui/banner.js";
import { buildPlan, runPlan } from "../orchestrate/plan.js";
import { DryRunDelegate } from "../orchestrate/delegate.js";
import { loadWorkspace } from "../workspace/workspace.js";

const FLAGS = ["registry", "skills", "routing", "root", "ws"] as const;

const HELP = `garry feature <featId> [options]

Orchestrate a cross service feature through the SDLC. It composes the pipeline
from the skills manifest, builds the service dependency graph (contract first),
resolves the model and agent routing per stage, and delegates per service across
the workspace.

Options:
  --registry <path>  registry root (default: the monorepo sample, ./registry or a sample copy)
  --skills <path>    skills root (default: ./garry-skills or the bundled skills)
  --routing <file>   routing matrix (default: garry.routing.json)
  --root <dir>       workspaces root, used to locate the worktrees
  --ws <dir>         explicit workspace directory
  --help, -h         show this help

By default this is a dry run: it prints the plan and the delegations without
calling a model. The live executor on the Claude Agent SDK is wired later.
`;

interface FeatureArgs {
  featId?: string;
  registry: string;
  skills: string;
  routing: string;
  root?: string;
  ws?: string;
  help: boolean;
}

function parse(argv: string[]): FeatureArgs {
  const values: Record<string, string> = {};
  const positional: string[] = [];
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") help = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if ((FLAGS as readonly string[]).includes(key) && val !== undefined && !val.startsWith("--")) {
        values[key] = val;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return {
    featId: positional[0],
    registry: values.registry ?? defaultRegistry(),
    skills: values.skills ?? defaultSkillsRoot(),
    routing: values.routing ?? "garry.routing.json",
    root: values.root,
    ws: values.ws,
    help,
  };
}

function findWorktrees(args: FeatureArgs): Record<string, string> | undefined {
  let wsDir: string | undefined;
  if (args.ws) wsDir = resolve(args.ws);
  else if (args.root && args.featId) wsDir = resolve(args.root, args.featId);
  if (!wsDir || !existsSync(join(wsDir, ".garry-workspace.json"))) return undefined;
  const state = loadWorkspace(wsDir);
  const map: Record<string, string> = {};
  for (const r of state.repos) map[r.service] = r.dir;
  return map;
}

export async function runFeature(argv: string[]): Promise<void> {
  const args = parse(argv);
  if (args.help || !args.featId) {
    console.log(HELP);
    return;
  }

  console.log("\n" + renderBanner());
  console.log(tagline() + "\n");

  const plan = buildPlan({
    registry: args.registry,
    skillsRoot: args.skills,
    routingFile: args.routing,
    featureId: args.featId,
    worktrees: findWorktrees(args),
  });

  console.log(pc.bold(`Feature ${plan.feature.id}: ${plan.feature.title}`));
  console.log(`  services (delegation order): ${plan.order.join(" -> ")}`);
  console.log(
    `  contract changes: ${plan.feature.contractChanges.join(", ") || "(none)"}`,
  );
  console.log(`  tasks: ${plan.tasks.length}`);
  console.log("\n" + pc.dim("Pipeline (dry run):") + "\n");

  await runPlan(plan, new DryRunDelegate());

  console.log("\n" + pc.green("Plan complete. This was a dry run; no model was called."));
}
