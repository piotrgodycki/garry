import { networkInterfaces } from "node:os";
import pc from "picocolors";
import { renderBanner, tagline } from "../ui/banner.js";
import { createGarryServer, type ServerConfig } from "../server/server.js";
import { MIN_TOKEN_LENGTH, accessToken, isLoopback } from "../server/auth.js";

const FLAGS = ["port", "host", "registry", "skills", "routing", "root"] as const;

const HELP = `garry serve [options]

Start the Garry HTTP server (REST plus SSE) over the supervisor. The UI uses it
to list features, fetch a plan and watch the live delegation stream.

Options:
  --port <n>         port (default: 8123)
  --host <addr>      address to listen on (default: GARRY_HOST or 127.0.0.1, this
                     machine only).
                     Use 0.0.0.0 to reach it from a phone on your network; that
                     needs GARRY_ACCESS_TOKEN in the environment or in .env.
  --registry <path>  registry root (default: garry-registry/examples/registry-sample)
  --skills <path>    skills repo root (default: garry-skills)
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
  const token = accessToken(); // also loads .env, so GARRY_HOST can live there
  const host = values.host ?? process.env.GARRY_HOST ?? "127.0.0.1";
  if (token && token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`GARRY_ACCESS_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters. Generate one with: openssl rand -hex 24`);
  }
  if (!isLoopback(host) && !token) {
    throw new Error(
      `refusing to listen on ${host} without GARRY_ACCESS_TOKEN: anyone on the network could drive your agents.\n` +
        "Set it in .env (openssl rand -hex 24), or keep the default host and use a private tunnel.",
    );
  }
  const cfg: ServerConfig = {
    registry: values.registry ?? "garry-registry/examples/registry-sample",
    skills: values.skills ?? "garry-skills",
    routing: values.routing ?? "garry.routing.json",
    root: values.root,
    accessToken: token,
  };

  console.log("\n" + renderBanner());
  console.log(tagline() + "\n");

  const server = createGarryServer(cfg);
  server.listen(port, host, () => {
    const shown = isLoopback(host) ? "localhost" : host;
    console.log(pc.green(`garry-server listening on http://${shown}:${port}`));
    console.log(
      token
        ? pc.dim("access token required on /api (GARRY_ACCESS_TOKEN)")
        : pc.dim("no access token: reachable from this machine only"),
    );
    if (token && !isLoopback(host)) {
      // One link per network address signs a phone in: the UI stores the token
      // from the #fragment (never sent to a server) and removes it from the URL.
      const ips = Object.values(networkInterfaces())
        .flat()
        .filter((i) => i && i.family === "IPv4" && !i.internal)
        .map((i) => i!.address);
      if (ips.length) {
        console.log(pc.bold("\nOpen Garry on your phone (same network, UI on port 3000):"));
        for (const ip of ips) console.log(`  http://${ip}:3000/#garry-token=${token}`);
        console.log(pc.dim("  This link contains your token. Share it only with your own devices."));
      }
    }
    console.log(pc.dim(`registry: ${cfg.registry}  skills: ${cfg.skills}  routing: ${cfg.routing}`));
  });
}
