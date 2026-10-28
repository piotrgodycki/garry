import pc from "picocolors";
import { ThreadStore } from "../threads/store.js";
import { githubToken } from "../github/env.js";
import { cloneRepo } from "../github/connect.js";
import { activeGarryProject } from "../project/store.js";

const HELP = `garry repos [list | add <path> [--name <name>] | import <owner/name> | settings <project> [options]]

The git repositories agents can work on in the active Garry project (garry
project). garry serve adds the repository it
starts in; add others here, then start threads in them from the dashboard,
the desktop app or your phone. Each thread works in its own branch and
worktree, so the checkout you work in is never touched.

import clones a GitHub repository into ~/.garry/repos and adds it (connect
first: garry github login, or GARRY_GITHUB_TOKEN, or a signed in gh).

settings shows or changes what Garry may do with a project's remote:
  --push ask|allow|never     ask first (default), push when opening a PR, or never
  --base <branch>            the branch pull requests go into (default: the repo's default)
  --prefix <prefix>          what Garry's branches start with (default: garry/)
  --protect <a,b,release/*>  branches never pushed to (default: main, master, develop, release/*)
  --draft true|false         open pull requests as drafts
`;

export function runProjects(argv: string[]): void {
  if (argv[0] === "import") {
    const repo = argv[1];
    if (!repo) throw new Error("garry projects import <owner/name>");
    const token = githubToken();
    if (!token) throw new Error("connect GitHub first: garry github login");
    const dir = cloneRepo(token, repo);
    const p = new ThreadStore().addProject(dir, repo.split("/")[1], activeGarryProject().id);
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
    const list = store.projectsOf(activeGarryProject().id);
    if (!list.length) console.log(pc.dim("No projects yet. garry projects add <path>, or run garry serve inside a repository."));
    for (const p of list) console.log(`${p.id}  ${pc.bold(p.name.padEnd(24))} ${p.path}`);
    return;
  }
  if (sub === "settings") {
    if (!path) throw new Error("garry projects settings <project id or name>");
    const p = store.projects().find((x) => x.id === path || x.name === path);
    if (!p) throw new Error(`no project ${path} (garry projects list)`);
    const flag = (name: string) => {
      const i = argv.indexOf(`--${name}`);
      return i >= 0 ? argv[i + 1] : undefined;
    };
    const change = Object.fromEntries(
      [
        ["push", flag("push")],
        ["baseBranch", flag("base")],
        ["branchPrefix", flag("prefix")],
        ["protectedBranches", flag("protect")],
        ["draftPr", flag("draft")],
      ].filter(([, v]) => v !== undefined),
    );
    const s = Object.keys(change).length ? store.saveSettings(p.id, change) : store.settings(p.id);
    console.log(`${pc.bold(p.name)} (${p.id})`);
    console.log(`  push        ${s.push}`);
    console.log(`  PRs into    ${s.baseBranch || pc.dim("the repository's default branch")}${s.draftPr ? " (drafts)" : ""}`);
    console.log(`  branches    ${s.branchPrefix}<work>-<id>`);
    console.log(`  protected   ${s.protectedBranches.join(", ") || pc.dim("none")}`);
    return;
  }
  if (sub === "add") {
    if (!path) throw new Error("garry projects add needs a path to a git repository");
    const i = argv.indexOf("--name");
    const p = store.addProject(path, i >= 0 ? argv[i + 1] : undefined, activeGarryProject().id);
    console.log(pc.green(`Project ${p.name} (${p.id}): ${p.path}`));
    return;
  }
  throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
}
