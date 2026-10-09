import { resolve } from "node:path";
import pc from "picocolors";
import { renderBanner, tagline } from "../ui/banner.js";
import { discoverRepos } from "../adopt/detect.js";
import { analyzeRepo, writeAdoption, existingServices, type AdoptResult } from "../adopt/adopt.js";
import { validateRegistry } from "../../../garry-registry/src/validate.js";

const FLAGS = ["registry"] as const;

const HELP = `garry adopt <repo> [options]

Reverse engineer a registry entry from an existing microfrontend (brownfield).
It detects the stack, reads the Module Federation config, and derives a service
manifest plus a remotes entry. By default it is a dry run; pass --write to apply.

Arguments:
  <repo>             path to an existing repo, or a directory of repos

Options:
  --registry <path>  registry root to read and (with --write) update
  --write            write the derived manifest and contracts into the registry
  --help, -h         show this help

Nothing becomes the source of truth until a human reviews and approves it.
`;

interface AdoptArgs {
  repo?: string;
  registry: string;
  write: boolean;
  help: boolean;
}

function parse(argv: string[]): AdoptArgs {
  const values: Record<string, string> = {};
  const positional: string[] = [];
  let write = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") help = true;
    else if (a === "--write") write = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if ((FLAGS as readonly string[]).includes(key) && val !== undefined && !val.startsWith("--")) {
        values[key] = val;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return {
    repo: positional[0],
    registry: values.registry ?? "garry-registry/examples/registry-sample",
    write,
    help,
  };
}

function report(r: AdoptResult, known: Set<string>): void {
  const readopt = known.has(r.service) ? pc.yellow("  (already in catalog, will be overwritten)") : "";
  console.log(pc.bold(`\n${r.service}`) + readopt);
  console.log(`  stack:      ${r.manifest.stack}`);
  console.log(`  evidence:   ${r.stack.evidence.join(", ") || "(none)"}`);
  console.log(`  exposes:    ${r.mf.exposes.join(", ") || "(none)"}`);
  console.log(`  remotes:    ${r.mf.remotes.join(", ") || "(none)"}`);
  console.log(`  shared:     ${r.mf.shared.join(", ") || "(none)"}`);
  if (r.stack.federation === "unknown")
    console.log(pc.yellow("  warning:    federation not detected; this may not be a microfrontend"));
}

export async function runAdopt(argv: string[]): Promise<void> {
  const args = parse(argv);
  if (args.help || !args.repo) {
    console.log(HELP);
    return;
  }

  console.log("\n" + renderBanner());
  console.log(tagline() + "\n");

  const repos = discoverRepos(resolve(args.repo));
  const known = existingServices(args.registry);
  const results = repos.map((r) => analyzeRepo(r));

  console.log(pc.bold(`Analyzed ${results.length} repo(s) under ${args.repo}`));
  for (const r of results) report(r, known);

  if (!args.write) {
    console.log(pc.dim("\nDry run. Re-run with --write to apply, then review before trusting it.\n"));
    return;
  }

  const written: string[] = [];
  for (const r of results) written.push(...writeAdoption(args.registry, r));
  console.log(pc.green(`\nWrote ${written.length} file(s) into ${args.registry}:`));
  for (const w of written) console.log(`  ${w}`);

  const issues = validateRegistry(args.registry);
  const errors = issues.filter((i) => i.level === "error");
  console.log(pc.bold(`\nValidation: ${errors.length} error(s), ${issues.length - errors.length} warning(s)`));
  for (const i of issues) {
    const mark = i.level === "error" ? pc.red("x") : pc.yellow("!");
    console.log(`  ${mark} [${i.where}] ${i.message}`);
  }
  console.log(pc.dim("\nReview the derived registry and approve it before it becomes the source of truth.\n"));
}
