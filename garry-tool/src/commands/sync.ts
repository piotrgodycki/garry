import { resolve, join } from "node:path";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { renderBanner, tagline } from "../ui/banner.js";
import { readManifest, readContracts, type Contracts } from "../sync/registryIO.js";
import { computeSlice } from "../sync/slice.js";
import { generateContractTypes } from "../sync/codegen.js";

interface SyncOptions {
  repo: string;
  registry: string;
  service: string;
}

const FLAGS = ["repo", "registry", "service"] as const;

const HELP = `garry sync [options]

Inject the slice of contracts this service may rely on into .garry/ and generate
the TypeScript types from them. Run it inside a scaffolded repository, or pass the
options explicitly.

Options:
  --repo <dir>          service repository (default: current directory)
  --service <name>      service name (default: from .garry/service.json)
  --registry <path>     registry root that holds catalog/ and contracts/
  --yes, -y             skip the wizard chrome and run headless
  --help, -h            show this help
`;

function parse(argv: string[]): { values: Partial<SyncOptions>; help: boolean; yes: boolean } {
  const values: Partial<SyncOptions> = {};
  let help = false;
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") help = true;
    else if (a === "--yes" || a === "-y") yes = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if ((FLAGS as readonly string[]).includes(key) && val !== undefined && !val.startsWith("--")) {
        (values as Record<string, string>)[key] = val;
        i++;
      }
    }
  }
  return { values, help, yes };
}

export async function runSync(argv: string[]): Promise<void> {
  const { values, help, yes } = parse(argv);
  if (help) {
    console.log(HELP);
    return;
  }

  console.log("\n" + renderBanner());
  console.log(tagline() + "\n");

  const repo = resolve(values.repo ?? ".");
  let service = values.service;
  let registry = values.registry;

  const metaFile = join(repo, ".garry", "service.json");
  if ((!service || !registry) && existsSync(metaFile)) {
    const meta = JSON.parse(readFileSync(metaFile, "utf8")) as { name?: string; registry?: string };
    service = service ?? meta.name;
    registry = registry ?? meta.registry;
  }

  if (!service) throw new Error("service not known: pass --service or run in a scaffolded repo with .garry/service.json");
  if (!registry) throw new Error("registry not known: pass --registry or run in a scaffolded repo");

  const interactive = Boolean(process.stdin.isTTY) && !yes;
  const s = interactive ? p.spinner() : null;
  s?.start(`Syncing contracts for ${service}`);

  const manifest = readManifest(registry, service);
  const contracts = readContracts(registry);
  const slice = computeSlice(manifest, contracts);
  const written = writeSlice(repo, manifest, slice);

  if (s) {
    s.stop(`Synced ${written.length} files for ${service}`);
    p.note(written.join("\n"), ".garry");
    p.outro(pc.green("Contracts and types are up to date."));
  } else {
    console.log(`Synced contracts for ${service} into ${join(repo, ".garry")}`);
    for (const w of written) console.log(`  ${w}`);
  }
}

function writeSlice(repo: string, manifest: ReturnType<typeof readManifest>, slice: Contracts): string[] {
  const written: string[] = [];
  const contractsDir = join(repo, ".garry", "contracts");
  mkdirSync(contractsDir, { recursive: true });

  const writeJson = (name: string, data: unknown) => {
    writeFileSync(join(contractsDir, name), JSON.stringify(data, null, 2) + "\n");
    written.push(`contracts/${name}`);
  };

  if (slice.remotes) writeJson("remotes.json", slice.remotes);
  if (slice.sharedDeps) writeJson("shared-deps.json", slice.sharedDeps);
  if (slice.designTokens) writeJson("design-tokens.json", slice.designTokens);
  if (slice.events) writeJson("events.json", slice.events);

  const typesDir = join(repo, ".garry", "types");
  mkdirSync(typesDir, { recursive: true });
  writeFileSync(join(typesDir, "contracts.d.ts"), generateContractTypes(manifest, slice));
  written.push("types/contracts.d.ts");

  return written;
}
