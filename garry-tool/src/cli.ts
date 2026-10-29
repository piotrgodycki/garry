#!/usr/bin/env node
import { runScaffold } from "./commands/scaffold.js";
import { runSync } from "./commands/sync.js";
import { runWs } from "./commands/ws.js";
import { runFeature } from "./commands/feature.js";
import { runServe } from "./commands/serve.js";
import { runAdopt } from "./commands/adopt.js";
import { runShots } from "./commands/shots.js";
import { runSkills } from "./commands/skills.js";
import { runDevices, runPair } from "./commands/pair.js";
import { runProjects } from "./commands/projects.js";
import { runProject } from "./commands/project.js";
import { runService } from "./commands/service.js";
import { runStack } from "./commands/stack.js";
import { runQa } from "./commands/qa.js";
import { runRouting } from "./commands/routing.js";
import { runArchitecture } from "./commands/architecture.js";
import { runGithub } from "./commands/github.js";
import { runHooks } from "./commands/hooks.js";
import { loadEnv } from "./github/env.js";

const [cmd, ...rest] = process.argv.slice(2);

const TOP_HELP = `garry <command>

Commands:
  scaffold   create a new microfrontend service (interactive wizard)
  service    the services in the registry (list, add, remove)
  stack      the tech stacks services are built with (list, catalog, add, check)
  routing    routing profiles: which agent and model per stage (list, new, use, set)
  architecture  the architecture board: check it, show it, list the blocks
  adopt      reverse engineer a registry entry from an existing repo
  sync       inject the contract slice into .garry/ and generate types
  ws         work on several services at once (multicheckout worktrees)
  feature    orchestrate a cross service feature through the SDLC
  serve      start the HTTP server (REST plus SSE) over the supervisor
  pair       pair a phone or another computer with a running server (QR code)
  devices    list or revoke paired devices
  project    Garry projects: list, new, use, export, import (one .garry.json file)
  repos      the repositories of the active project (list, add <path>, import <owner/name>)
  github     connect Garry to GitHub (status, login, logout, repos)
  skills     list the skills, install or remove local ones
  shots      screenshots for code review: capture, compare, comment on the PR
  qa         does a change need a person to try it (label and checklist on the PR)
  hooks      keep files small for agents: the pre-commit check (check, install)

Run "garry <command> --help" for command options.
`;

async function main(): Promise<void> {
  loadEnv();
  switch (cmd) {
    case "scaffold":
      await runScaffold(rest);
      break;
    case "service":
    case "services":
      runService(rest);
      break;
    case "stack":
    case "stacks":
      runStack(rest);
      break;
    case "adopt":
      await runAdopt(rest);
      break;
    case "sync":
      await runSync(rest);
      break;
    case "ws":
      await runWs(rest);
      break;
    case "feature":
      await runFeature(rest);
      break;
    case "serve":
      await runServe(rest);
      break;
    case "pair":
      await runPair(rest);
      break;
    case "devices":
      await runDevices(rest);
      break;
    case "github":
      await runGithub(rest);
      break;
    case "project":
      runProject(rest);
      break;
    // the repositories of the active project ("projects" is the old name)
    case "repos":
    case "projects":
      runProjects(rest);
      break;
    case "skills":
      await runSkills(rest);
      break;
    case "architecture":
      runArchitecture(rest);
      break;
    case "routing":
      runRouting(rest);
      break;
    case "qa":
      await runQa(rest);
      break;
    case "shots":
      await runShots(rest);
      break;
    case "hooks":
      runHooks(rest);
      break;
    case undefined:
    case "--help":
    case "-h":
      console.log(TOP_HELP);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
});
