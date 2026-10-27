import pc from "picocolors";
import { defaultRegistry } from "../paths.js";
import { architectureState } from "../registry/architecture.js";
import { CAPABILITIES, COMPONENTS, PROVIDERS } from "../../../garry-registry/src/architecture.js";

const HELP = `garry architecture [check | show | blocks]

The architecture board (architecture.json in the registry): your services and
the platforms they run on, joined by what one needs and the other provides.
Build it on the dashboard's Architecture page; here you can check it and read it.

  check    what is missing or does not fit (exit code 1 on an error)
  show     the blocks and their links
  blocks   every block Garry offers, by provider, with what it provides and needs
`;

export function runArchitecture(argv: string[]): void {
  const [sub = "check"] = argv;
  if (sub === "--help" || sub === "-h") {
    console.log(HELP);
    return;
  }
  const i = argv.indexOf("--registry");
  const registry = i >= 0 ? argv[i + 1] : defaultRegistry();
  if (sub === "blocks") {
    for (const p of PROVIDERS) {
      console.log(pc.bold(p));
      for (const c of COMPONENTS.filter((x) => x.provider === p))
        console.log(`  ${c.id.padEnd(20)} provides ${c.provides.join(", ") || "-"}${c.needs?.length ? `  needs ${c.needs.join(", ")}` : ""}`);
    }
    console.log(pc.dim(`\ncapabilities: ${Object.keys(CAPABILITIES).join(", ")}`));
    return;
  }
  const { architecture, issues } = architectureState(registry);
  if (sub === "show") {
    const name = new Map(architecture.nodes.map((n) => [n.id, n.label ?? n.block]));
    for (const n of architecture.nodes) console.log(`${pc.bold(n.label ?? n.block)} ${pc.dim(n.block)}`);
    for (const e of architecture.edges) console.log(`  ${name.get(e.from)} -> ${name.get(e.to)} ${pc.dim(e.capability)}`);
    if (!architecture.nodes.length) console.log(pc.dim("The board is empty. Build it on the dashboard's Architecture page."));
    return;
  }
  if (sub === "check") {
    if (!issues.length) console.log(pc.green("Everything fits."));
    for (const x of issues) console.log(`${x.level === "error" ? pc.red("error") : x.level === "warn" ? pc.yellow("warn ") : pc.dim("info ")} ${x.message}`);
    if (issues.some((x) => x.level === "error")) process.exitCode = 1;
    return;
  }
  throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
}
