import pc from "picocolors";
import { ThreadStore } from "../threads/store.js";

const HELP = `garry projects [list | add <path> [--name <name>]]

The git repositories agents can work on. garry serve adds the repository it
starts in; add others here, then start threads in them from the dashboard,
the desktop app or your phone. Each thread works in its own branch and
worktree, so the checkout you work in is never touched.
`;

export function runProjects(argv: string[]): void {
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
