#!/usr/bin/env node
import { runScaffold } from "./commands/scaffold.js";
import { runSync } from "./commands/sync.js";
import { runWs } from "./commands/ws.js";
import { runFeature } from "./commands/feature.js";
import { runServe } from "./commands/serve.js";
import { runAdopt } from "./commands/adopt.js";
import { runShots } from "./commands/shots.js";

const [cmd, ...rest] = process.argv.slice(2);

const TOP_HELP = `garry <command>

Commands:
  scaffold   create a new microfrontend service (interactive wizard)
  adopt      reverse engineer a registry entry from an existing repo
  sync       inject the contract slice into .garry/ and generate types
  ws         work on several services at once (multicheckout worktrees)
  feature    orchestrate a cross service feature through the SDLC
  serve      start the HTTP server (REST plus SSE) over the supervisor
  shots      screenshots for code review: capture, compare, comment on the PR

Run "garry <command> --help" for command options.
`;

async function main(): Promise<void> {
  switch (cmd) {
    case "scaffold":
      await runScaffold(rest);
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
    case "shots":
      await runShots(rest);
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
