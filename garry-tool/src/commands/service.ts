import pc from "picocolors";
import { defaultRegistry } from "../paths.js";
import { listManifests } from "../sync/registryIO.js";
import { SERVICE_KINDS, addService, removeService } from "../registry/services.js";

const HELP = `garry service [list | add <name> [options] | remove <name>]

The services in the registry: one manifest each in catalog/<name>.yaml, which
the agents read before they touch a repository. Add the services you already
have here (or with the dashboard, Registry, Add service); garry scaffold creates
the code of a new microfrontend and adds it too, garry adopt derives the entry
from an existing one.

Options for add:
  --kind <kind>            ${SERVICE_KINDS.join(" | ")} (required)
  --repo <url>             the service's git repository (required)
  --owner <team>           default: unassigned
  --stack <text>           e.g. "react + vite + module-federation-2"
  --stack-ref <name>       a stack from garry stack list (fills --stack)
  --exposes <a,b>          modules or endpoints it offers, comma separated
  --consumes <svc:a,b>     what it uses from another service (repeatable)
  --replace                overwrite an existing manifest
  --registry <path>        registry root (default: ./registry, else ~/.garry/registry)
`;

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const csv = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function runService(argv: string[]): void {
  const [sub = "list", name] = argv;
  if (sub === "--help" || sub === "-h") {
    console.log(HELP);
    return;
  }
  const registry = flag(argv, "registry") ?? defaultRegistry();
  if (sub === "list") {
    const services = listManifests(registry);
    if (!services.length) console.log(pc.dim(`No services in ${registry} yet. garry service add <name> --kind <kind> --repo <url>`));
    for (const s of services) console.log(`${pc.bold(s.name.padEnd(24))} ${String(s.kind ?? "").padEnd(11)} ${String(s.owner ?? "")}`);
    return;
  }
  if (sub === "add") {
    if (!name || name.startsWith("--")) throw new Error("garry service add needs a name");
    const consumes: Record<string, string[]> = {};
    argv.forEach((a, i) => {
      if (a !== "--consumes") return;
      const [svc, mods = ""] = (argv[i + 1] ?? "").split(":");
      if (svc) consumes[svc] = csv(mods);
    });
    const r = addService(
      registry,
      { name, kind: flag(argv, "kind"), repo: flag(argv, "repo"), owner: flag(argv, "owner"), stack: flag(argv, "stack"), stackRef: flag(argv, "stack-ref"), exposes: csv(flag(argv, "exposes")), consumes },
      { replace: argv.includes("--replace") },
    );
    console.log(pc.green(`Added ${r.service.name} (${r.service.kind}): ${r.file}`));
    for (const i of r.issues) console.log(`${i.level === "error" ? pc.red("error") : pc.yellow("warn ")} ${i.where}: ${i.message}`);
    return;
  }
  if (sub === "remove") {
    if (!name) throw new Error("garry service remove needs a name");
    removeService(registry, name);
    console.log(pc.green(`Removed ${name}`));
    return;
  }
  throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
}
