import pc from "picocolors";
import { ThreadStore } from "../threads/store.js";
import { githubToken } from "../github/env.js";
import { cloneRepo } from "../github/connect.js";

const HELP = `garry projects [list | add <path> [--name <name>] | import <owner/name>]

The git repositories agents can work on. garry serve adds the repository it
starts in; add others here, then start threads in them from the dashboard,
the desktop app or your phone. Each thread works in its own branch and
worktree, so the checkout you work in is never touched.

import clones a GitHub repository into ~/.garry/repos and adds it (connect
first: garry github login, or GARRY_GITHUB_TOKEN, or a signed in gh).
`;

export function runProjects(argv: string[]): void {
  if (argv[0] === "import") {
    const repo = argv[1];
    if (!repo) throw new Error("garry projects import <owner/name>");
    const token = githubToken();
    if (!token) throw new Error("connect GitHub first: garry github login");
    const dir = cloneRepo(token, repo);
    const p = new ThreadStore().addProject(dir, repo.split("/")[1]);
    console.log(pc.green(`Project ${p.name} (${p.id}): ${p.path}`));
    return;
  }
  const [sub = "list", path] = argv;
  if (sub === "--help" || sub === "-h") {
    console.log(HELP);
    return;
  }
  const store = new ThreadStore();
  if (sub === "list") {
    const list = store.projects();
    if (!list.length) console.log(pc.dim("No projects yet. garry projects add <path>, or run garry serve inside a repository."));
    for (const p of list) console.log(`${p.id}  ${pc.bold(p.name.padEnd(24))} ${p.path}`);
    return;
  }
  if (sub === "add") {
    if (!path) throw new Error("garry projects add needs a path to a git repository");
    const i = argv.indexOf("--name");
    const p = store.addProject(path, i >= 0 ? argv[i + 1] : undefined);
    console.log(pc.green(`Project ${p.name} (${p.id}): ${p.path}`));
    return;
  }
  throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
}
