import { resolve, join } from "node:path";
import { homedir } from "node:os";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { renderBanner, tagline } from "../ui/banner.js";
import {
  createWorkspace,
  loadWorkspace,
  repoStatus,
  type WorkspaceState,
} from "../workspace/workspace.js";
import { gitTry } from "../workspace/git.js";
import { syncService } from "../sync/core.js";

const FLAGS = ["registry", "cache", "root", "ws"] as const;

const HELP = `garry ws <subcommand> [featId] [options]

Work on several services at once: one git worktree per service on the shared
branch feat/<featId>, driven by the services listed in the feature.

Subcommands:
  create <featId>   materialize the workspace (mirror cache plus worktrees)
  status [featId]   fan out git status across the worktrees
  sync   [featId]   run garry sync in every worktree
  push   [featId]   push every worktree (asks for confirmation)
  pr     [featId]   show the pull requests that would be opened

Options:
  --registry <path>  registry root (create reads services and repo urls here)
  --cache <dir>      mirror clone cache (default: ~/.garry/cache)
  --root <dir>       workspaces root (default: ~/garry-workspaces)
  --ws <dir>         explicit workspace directory (overrides root plus featId)
  --yes, -y          run headless, assume yes for push
  --help, -h         show this help
`;

interface WsArgs {
  sub?: string;
  featId?: string;
  registry: string;
  cache: string;
  root: string;
  ws?: string;
  yes: boolean;
  help: boolean;
}

function parse(argv: string[]): WsArgs {
  const values: Record<string, string> = {};
  let yes = false;
  let help = false;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") help = true;
    else if (a === "--yes" || a === "-y") yes = true;
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
    sub: positional[0],
    featId: positional[1],
    registry: values.registry ?? "garry-registry/examples/registry-sample",
    cache: values.cache ?? join(homedir(), ".garry", "cache"),
    root: values.root ?? join(homedir(), "garry-workspaces"),
    ws: values.ws,
    yes,
    help,
  };
}

function resolveWsDir(args: WsArgs): string {
  if (args.ws) return resolve(args.ws);
  if (!args.featId) throw new Error("missing featId (or pass --ws <dir>)");
  return resolve(args.root, args.featId);
}

export async function runWs(argv: string[]): Promise<void> {
  const args = parse(argv);
  if (args.help || !args.sub) {
    console.log(HELP);
    return;
  }

  console.log("\n" + renderBanner());
  console.log(tagline() + "\n");

  switch (args.sub) {
    case "create":
      return wsCreate(args);
    case "status":
      return wsStatus(args);
    case "sync":
      return wsSync(args);
    case "push":
      return wsPush(args);
    case "pr":
      return wsPr(args);
    default:
      throw new Error(`unknown ws subcommand: ${args.sub}`);
  }
}

function wsCreate(args: WsArgs): void {
  if (!args.featId) throw new Error("missing featId: garry ws create <featId>");
  const state = createWorkspace(args.registry, args.featId, { cache: args.cache, root: args.root });
  console.log(`Workspace ${state.id} on branch ${state.branch}`);
  for (const r of state.repos) console.log(`  ${r.service}  ->  ${r.dir}`);
  console.log(`\nNext: garry ws sync ${state.id} to inject contracts into every worktree.`);
}

function wsStatus(args: WsArgs): void {
  const state = loadWorkspace(resolveWsDir(args));
  console.log(`Workspace ${state.id} (branch ${state.branch})`);
  for (const r of state.repos) {
    const s = repoStatus(r.dir);
    const flag = s.dirty === 0 ? pc.green("clean") : pc.yellow(`${s.dirty} changed`);
    const onBranch = s.branch === state.branch ? pc.green(s.branch) : pc.red(s.branch);
    console.log(`  ${r.service.padEnd(16)} ${onBranch.padEnd(24)} ${flag}`);
  }
}

function wsSync(args: WsArgs): void {
  const state = loadWorkspace(resolveWsDir(args));
  for (const r of state.repos) {
    const written = syncService(r.dir, state.registry, r.service);
    console.log(`  ${r.service}: synced ${written.length} files`);
  }
  console.log("Contracts and types are up to date in every worktree.");
}

async function wsPush(args: WsArgs): Promise<void> {
  const state = loadWorkspace(resolveWsDir(args));
  const interactive = Boolean(process.stdin.isTTY) && !args.yes;
  if (interactive) {
    const ok = await p.confirm({ message: `Push ${state.repos.length} repos on ${state.branch}?` });
    if (p.isCancel(ok) || !ok) {
      console.log("Push cancelled.");
      return;
    }
  }
  for (const r of state.repos) {
    const res = gitTry(["-C", r.dir, "push", "origin", state.branch]);
    console.log(`  ${r.service}: ${res.ok ? pc.green("pushed") : pc.red("failed")}`);
    if (!res.ok) console.log(`    ${res.out.split("\n")[0]}`);
  }
}

function wsPr(args: WsArgs): void {
  const state = loadWorkspace(resolveWsDir(args));
  console.log(`Pull requests for ${state.id} (${state.branch} into the default branch):`);
  for (const r of state.repos) {
    console.log(`  ${r.service}: ${state.branch} -> default`);
  }
  console.log("\nOpening real pull requests is wired in phase 6 (GitHub, narrow token).");
}
