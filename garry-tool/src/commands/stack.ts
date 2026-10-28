import pc from "picocolors";
import { defaultRegistry } from "../paths.js";
import { listStacks, removeStack, saveStack } from "../registry/stacks.js";
import { CATALOG, CATEGORIES, checkStack, stackLine, type StackIssue } from "../registry/schema/stacks.js";

const HELP = `garry stack [list | catalog | add <name> --tech <a,b@1.2,...> | check <a,b,...> | remove <name>]

The tech stacks in the registry (stacks/<name>.yaml): named sets of technologies
your services are built with. A service points at one with stackRef
(garry service add --stack-ref <name>, or the service form), and the agents read
it. The dashboard's Stacks page does the same with a picker.

Options for add:
  --tech <list>         technology ids from garry stack catalog, comma separated;
                        id@version pins a version (react@19)
  --description <text>  what the stack is for
  --replace             overwrite an existing stack
  --registry <path>     registry root (default: ./registry, else ~/.garry/registry)
`;

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const csv = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function print(issues: StackIssue[]): void {
  for (const i of issues) console.log(`${i.level === "error" ? pc.red("error") : i.level === "warn" ? pc.yellow("warn ") : pc.dim("info ")} ${i.message}`);
}

export function runStack(argv: string[]): void {
  const [sub = "list", name] = argv;
  if (sub === "--help" || sub === "-h") {
    console.log(HELP);
    return;
  }
  const registry = flag(argv, "registry") ?? defaultRegistry();
  if (sub === "list") {
    const stacks = listStacks(registry);
    if (!stacks.length) console.log(pc.dim(`No stacks in ${registry} yet. garry stack add <name> --tech react,vite,typescript`));
    for (const s of stacks) {
      console.log(`${pc.bold(s.name)}  ${stackLine(s)}${s.usedBy.length ? pc.dim(`  used by ${s.usedBy.join(", ")}`) : ""}`);
      print(s.issues.filter((i) => i.level !== "info"));
    }
    return;
  }
  if (sub === "catalog") {
    for (const c of CATEGORIES) {
      const techs = CATALOG.filter((t) => t.category === c.id);
      console.log(`${pc.bold(c.label.padEnd(18))} ${techs.map((t) => t.id).join(", ")}`);
    }
    return;
  }
  if (sub === "check") {
    const issues = checkStack(csv(name));
    if (!issues.length) console.log(pc.green("These fit together."));
    print(issues);
    return;
  }
  if (sub === "add") {
    if (!name || name.startsWith("--")) throw new Error("garry stack add needs a name");
    const technologies = csv(flag(argv, "tech")).map((t) => {
      const [id, version] = t.split("@");
      return { id, version };
    });
    const r = saveStack(registry, { name, description: flag(argv, "description"), technologies }, { replace: argv.includes("--replace") });
    console.log(pc.green(`Saved ${r.stack.name}: ${stackLine(r.stack)}`));
    print(r.issues);
    return;
  }
  if (sub === "remove") {
    if (!name) throw new Error("garry stack remove needs a name");
    removeStack(registry, name);
    console.log(pc.green(`Removed ${name}`));
    return;
  }
  throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
}
