import { readFileSync, writeFileSync } from "node:fs";
import pc from "picocolors";
import { ThreadStore } from "../threads/store.js";
import { activeGarryProject, createGarryProject, listGarryProjects, removeGarryProject, useGarryProject } from "../project/store.js";
import { exportGarryProject, importGarryProject, originOf } from "../project/bundle.js";

const HELP = `garry project [list | new <name> | use <id> | export [id] [--out <file>] | import <file> | remove <id>]

A Garry project is everything one product is made of: its registry
(services, contracts, features, stacks, routing, the architecture board) and
the repositories agents work on in it, with their push settings. Switch
between projects here or in the dashboard (the switcher at the top of the
sidebar). export writes one .garry.json file (no tokens, no code; the
repositories as remotes to clone); import makes a new project from one.

garry repos lists and adds the repositories of the active project.
`;

export function runProject(argv: string[]): void {
  const [sub = "list", arg] = argv;
  const flag = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (sub === "--help" || sub === "-h") return void console.log(HELP);
  if (sub === "list") {
    const { active, projects } = listGarryProjects();
    const store = new ThreadStore();
    for (const p of projects) {
      const repos = store.projectsOf(p.id).length;
      console.log(`${p.id === active ? pc.green("●") : " "} ${pc.bold(p.id.padEnd(24))} ${p.name}${pc.dim(`  ${repos} repo${repos === 1 ? "" : "s"}${p.pendingRepos?.length ? `, ${p.pendingRepos.length} to clone` : ""}`)}`);
    }
    return;
  }
  if (sub === "new") {
    const name = argv.slice(1).filter((a) => !a.startsWith("--")).join(" ");
    const p = createGarryProject({ name, description: flag("description") });
    console.log(pc.green(`Created ${p.name} (${p.id}). Switch to it with garry project use ${p.id}`));
    return;
  }
  if (sub === "use") {
    if (!arg) throw new Error("garry project use <id>");
    const p = useGarryProject(arg);
    console.log(pc.green(`${p.name} is the active project (${p.path}). A running garry serve switches in the dashboard.`));
    return;
  }
  if (sub === "export") {
    const id = arg && !arg.startsWith("--") ? arg : activeGarryProject().id;
    const store = new ThreadStore();
    const repos = store
      .projectsOf(id)
      .map((r) => ({ name: r.name, remote: originOf(r.path), ...(r.settings ? { settings: r.settings } : {}) }))
      .filter((r) => r.remote);
    const out = flag("out") ?? `${id}.garry.json`;
    writeFileSync(out, JSON.stringify(exportGarryProject(id, repos), null, 2) + "\n");
    console.log(pc.green(`Exported ${id} to ${out}`));
    return;
  }
  if (sub === "import") {
    if (!arg) throw new Error("garry project import <file.garry.json>");
    const p = importGarryProject(JSON.parse(readFileSync(arg, "utf8")));
    console.log(pc.green(`Imported ${p.name} (${p.id}).`) + (p.pendingRepos?.length ? pc.dim(` ${p.pendingRepos.length} repositories to clone from the dashboard (Build).`) : ""));
    return;
  }
  if (sub === "remove") {
    if (!arg) throw new Error("garry project remove <id>");
    removeGarryProject(arg);
    console.log(pc.green(`Removed ${arg}`));
    return;
  }
  throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
}
