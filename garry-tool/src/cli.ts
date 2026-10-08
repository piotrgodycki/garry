#!/usr/bin/env node
import { runScaffold } from "./commands/scaffold.js";

const [cmd, ...rest] = process.argv.slice(2);

const TOP_HELP = `garry <command>

Commands:
  scaffold   create a new microfrontend service (interactive wizard)

Run "garry scaffold --help" for scaffold options.
`;

async function main(): Promise<void> {
  switch (cmd) {
    case "scaffold":
      await runScaffold(rest);
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
