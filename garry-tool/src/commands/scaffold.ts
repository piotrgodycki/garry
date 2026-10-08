import { resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { renderBanner, tagline, stepper } from "../ui/banner.js";
import {
  parseArgs,
  applyDefaults,
  stackString,
  type ScaffoldOptions,
  type ServiceKind,
} from "../scaffold/options.js";
import { renderService } from "../scaffold/templates.js";
import { writeFiles, writeCatalogEntry } from "../scaffold/writer.js";

const HELP = `garry scaffold [name] [options]

Create a new microfrontend service. Runs as an interactive wizard in a terminal,
or headless when all required options are passed.

Options:
  --kind <shell|remote>     service kind (required headless)
  --framework <name>        default: react
  --bundler <name>          default: vite
  --federation <name>       default: module-federation-2
  --owner <team>            default: team-unknown
  --registry <path>         registry root that holds catalog/
  --out <dir>               output directory (default: ./<name>)
  --yes, -y                 skip the wizard and use options and defaults
  --help, -h                show this help
`;

export async function runScaffold(argv: string[]): Promise<void> {
  const { values, help, yes } = parseArgs(argv);
  if (help) {
    console.log(HELP);
    return;
  }

  console.log("\n" + renderBanner());
  console.log(tagline() + "\n");

  const interactive = Boolean(process.stdin.isTTY) && !yes;
  const merged = applyDefaults(values);
  const opts = interactive ? await promptWizard(merged) : resolveHeadless(merged);

  const outRoot = resolve(opts.out);
  const files = renderService(opts);

  if (interactive) {
    const s = p.spinner();
    s.start(`Scaffolding ${opts.name}`);
    writeFiles(outRoot, files);
    const catalogFile = writeCatalogEntry(opts);
    s.stop(`Scaffolded ${opts.name}`);
    p.note(
      [
        `kind:     ${opts.kind}`,
        `stack:    ${stackString(opts)}`,
        `files:    ${files.length} in ${outRoot}`,
        `catalog:  ${catalogFile}`,
      ].join("\n"),
      "Done",
    );
    p.outro(pc.green("Next: run garry sync in the new repo to inject contracts."));
  } else {
    writeFiles(outRoot, files);
    const catalogFile = writeCatalogEntry(opts);
    console.log(`Scaffolded ${opts.name} (${opts.kind})`);
    console.log(`  stack:   ${stackString(opts)}`);
    console.log(`  files:   ${files.length} in ${outRoot}`);
    console.log(`  catalog: ${catalogFile}`);
    console.log("Next: run garry sync in the new repo to inject contracts.");
  }
}

async function promptWizard(v: Partial<ScaffoldOptions>): Promise<ScaffoldOptions> {
  p.intro(pc.bgCyan(pc.black(" garry scaffold ")));

  console.log(stepper(1, 4));
  const name =
    v.name ??
    (await ask(
      p.text({
        message: "Service name",
        placeholder: "checkout-mfe",
        validate: (x) =>
          !x
            ? "required"
            : /^[a-z0-9-]+$/.test(x)
              ? undefined
              : "use lowercase letters, digits and hyphens",
      }),
    ));

  console.log(stepper(2, 4));
  const kind =
    (v.kind as ServiceKind | undefined) ??
    (await ask(
      p.select({
        message: "Service kind",
        options: [
          { value: "remote", label: "remote (exposes modules)" },
          { value: "shell", label: "shell host (consumes remotes)" },
        ],
      }),
    ));

  console.log(stepper(3, 4));
  const framework =
    v.framework ??
    (await ask(
      p.select({
        message: "Framework",
        options: [
          { value: "react", label: "React 19" },
          { value: "vue", label: "Vue" },
        ],
      }),
    ));
  const bundler =
    v.bundler ??
    (await ask(
      p.select({
        message: "Bundler",
        options: [
          { value: "vite", label: "Vite" },
          { value: "webpack", label: "Webpack" },
          { value: "rspack", label: "Rspack" },
        ],
      }),
    ));

  console.log(stepper(4, 4));
  const owner =
    v.owner ??
    (await ask(p.text({ message: "Owner team", placeholder: "team-payments", defaultValue: "team-unknown" })));
  const out =
    v.out ?? (await ask(p.text({ message: "Output directory", defaultValue: `./${name}`, placeholder: `./${name}` })));

  return {
    name: name as string,
    kind: kind as ServiceKind,
    framework: framework as string,
    bundler: bundler as string,
    federation: v.federation ?? "module-federation-2",
    owner: owner as string,
    registry: v.registry as string,
    out: out as string,
  };
}

function ask<T>(prompt: Promise<T | symbol>): Promise<T> {
  return prompt.then((r) => {
    if (p.isCancel(r)) {
      p.cancel("Cancelled.");
      process.exit(1);
    }
    return r as T;
  });
}

function resolveHeadless(v: Partial<ScaffoldOptions>): ScaffoldOptions {
  const missing: string[] = [];
  if (!v.name) missing.push("name");
  if (!v.kind) missing.push("kind");
  if (v.kind && v.kind !== "shell" && v.kind !== "remote") {
    throw new Error(`kind must be shell or remote, got ${v.kind}`);
  }
  if (missing.length) {
    throw new Error(
      `Missing required options in non interactive mode: ${missing.join(", ")}. ` +
        "Pass --name and --kind, or run in a terminal for the wizard.",
    );
  }
  return {
    name: v.name as string,
    kind: v.kind as ServiceKind,
    framework: v.framework as string,
    bundler: v.bundler as string,
    federation: v.federation as string,
    owner: v.owner as string,
    registry: v.registry as string,
    out: v.out ?? `./${v.name}`,
  };
}
