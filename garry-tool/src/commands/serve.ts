import pc from "picocolors";
import { defaultRegistry, defaultSkillsRoot, defaultUiDir } from "../paths.js";
import { renderBanner, tagline } from "../ui/banner.js";
import { activeGarryProject } from "../project/store.js";
import { createGarryServer, type ServerConfig } from "../server/server.js";
import { DeviceStore } from "../server/auth.js";
import { ThreadManager } from "../threads/manager.js";
import { existsSync } from "node:fs";
import { advertisedHost, hostsFor, isLoopbackHost, printPairing } from "../server/pairing.js";

const FLAGS = ["port", "host", "ui", "registry", "skills", "routing", "root"] as const;

const HELP = `garry serve [options]

Start the Garry HTTP server (REST plus SSE) over the supervisor. The UI uses it
to list features, fetch a plan and watch the live delegation stream.

Options:
  --port <n>         port (default: 8123)
  --host <address>   address to listen on (default: 127.0.0.1, this machine only).
                     A LAN or Tailscale address, or 0.0.0.0 for every network,
                     lets paired phones and computers connect; a pairing QR
                     code is printed at start.
  --ui <dir>         the built dashboard to serve (default: garry-ui/dist, or the
                     one shipped with garry); open http://localhost:<port>
  --registry <path>  registry root (default: ./registry, else ~/.garry/registry)
  --skills <path>    skills root (default: the skills shipped with garry)
  --routing <file>   routing matrix (default: garry.routing.json)
  --root <dir>       workspaces root, used to locate the worktrees
  --help, -h         show this help
`;

export async function runServe(argv: string[]): Promise<void> {
  const values: Record<string, string> = {};
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") help = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if ((FLAGS as readonly string[]).includes(key) && val !== undefined && !val.startsWith("--")) {
        values[key] = val;
        i++;
      }
    }
  }
  if (help) {
    console.log(HELP);
    return;
  }

  const port = Number(values.port ?? 8123);
  const host = values.host ?? "127.0.0.1";
  const cfg: ServerConfig = {
    registry: values.registry ?? defaultRegistry(),
    skills: values.skills ?? defaultSkillsRoot(),
    routing: values.routing ?? "garry.routing.json",
    root: values.root,
    ui: values.ui ?? defaultUiDir(),
    // the names other devices use to reach this server
    hosts: hostsFor(host),
    threads: new ThreadManager(),
  };
  // the repository garry serve starts in is a project agents can work on
  if (existsSync(".git")) cfg.threads!.store.addProject(process.cwd(), undefined, activeGarryProject().id);

  console.log("\n" + renderBanner());
  console.log(tagline() + "\n");

  const devices = new DeviceStore();
  const server = createGarryServer(cfg, devices);
  server.listen(port, host, () => {
    console.log(pc.green(`garry-server listening on http://${host.includes(":") ? `[${host}]` : host}:${port}`));
    console.log(pc.dim(`registry: ${cfg.registry}  skills: ${cfg.skills}  routing: ${cfg.routing}`));
    console.log(cfg.ui ? `dashboard: ${pc.cyan(`http://localhost:${port}`)}` : pc.dim("dashboard: not built (pnpm -C garry-ui build), API only"));
    if (isLoopbackHost(host)) {
      console.log(pc.dim("Only this machine can connect. Use --host to pair a phone or another computer."));
      return;
    }
    const advertised = advertisedHost(host);
    if (!advertised) {
      console.log(pc.yellow("No network address found to pair with; pass the address other devices reach with --host."));
      return;
    }
    const { code, expiresAt } = devices.createCode();
    void printPairing(advertised, port, code, expiresAt);
  });
}
