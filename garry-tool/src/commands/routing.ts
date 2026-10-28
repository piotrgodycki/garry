import pc from "picocolors";
import { defaultRegistry } from "../paths.js";
import { MODELS } from "../orchestrate/models.js";
import { STAGE_NAMES, listProfiles, removeProfile, saveProfile, setActiveProfile, setStageRoute, type RoutingProfile } from "../orchestrate/profiles.js";

const HELP = `garry routing [list | show <name> | new <name> [--from <name>] | use <name> | set <name> <stage> [--model <id>] [--agent <role>] | remove <name>]

Routing profiles: which agent role and which model handle each SDLC stage.
"default" is used unless another is active. It starts as Garry's setup
(garry.routing.json in this folder, else the built-in); change it like any
profile (set default <stage> ...), put Garry's setup back (remove default), or
make your own from it (new <name> --from default) and make that active (use). A feature can pick a
profile with "routing: <name>" in its frontmatter. Profiles live in the registry
as routing/<name>.json.

Stages: ${STAGE_NAMES.join(", ")}, or "defaults" for the fallback.
Models: ${MODELS.map((m) => m.id).join(", ")}

Options:
  --registry <path>  registry root (default: ./registry, else ~/.garry/registry)
  --routing <file>   Garry's setup for default (default: garry.routing.json)
`;

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function show(p: RoutingProfile, active: boolean): void {
  console.log(`${pc.bold(p.name)}${p.name === "default" && p.builtin ? pc.dim(" (Garry's setup)") : ""}${active ? pc.green(" active") : ""}${p.description ? pc.dim(`  ${p.description}`) : ""}`);
  for (const s of STAGE_NAMES) {
    const r = p.stages[s] ?? p.defaults;
    console.log(`  ${s.padEnd(10)} ${r.agent.padEnd(16)} ${r.model}`);
  }
}

export function runRouting(argv: string[]): void {
  const [sub = "list", name, stage] = argv;
  if (sub === "--help" || sub === "-h") {
    console.log(HELP);
    return;
  }
  const registry = flag(argv, "registry") ?? defaultRegistry();
  const legacyFile = flag(argv, "routing") ?? "garry.routing.json";
  const all = () => listProfiles(registry, legacyFile);
  if (sub === "list") {
    const { active, profiles } = all();
    for (const p of profiles) console.log(`${p.name === active ? pc.green("●") : " "} ${pc.bold(p.name.padEnd(20))} ${p.name === "default" ? pc.dim(p.builtin ? "Garry's setup" : "changed") : ""}${p.description ? pc.dim(` ${p.description}`) : ""}`);
    return;
  }
  if (sub === "show") {
    const { active, profiles } = all();
    const p = profiles.find((x) => x.name === (name ?? active));
    if (!p) throw new Error(`no profile ${name}`);
    show(p, p.name === active);
    return;
  }
  if (!name) throw new Error(`garry routing ${sub} needs a profile name`);
  if (sub === "new") {
    const p = saveProfile(registry, { name, from: flag(argv, "from") ?? "default", description: flag(argv, "description") }, { legacyFile });
    console.log(pc.green(`Created ${p.name}. Change it with garry routing set ${p.name} <stage> --model <id>, use it with garry routing use ${p.name}`));
    return;
  }
  if (sub === "use") {
    setActiveProfile(registry, name);
    console.log(pc.green(`${name} is the active routing`));
    return;
  }
  if (sub === "set") {
    if (!stage) throw new Error("garry routing set <name> <stage> --model <id> [--agent <role>]");
    const p = setStageRoute(registry, name, stage, { model: flag(argv, "model"), agent: flag(argv, "agent") }, legacyFile);
    show(p, all().active === p.name);
    return;
  }
  if (sub === "remove") {
    removeProfile(registry, name);
    console.log(pc.green(name === "default" ? "default is back to Garry's setup" : `Removed ${name}`));
    return;
  }
  throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
}
