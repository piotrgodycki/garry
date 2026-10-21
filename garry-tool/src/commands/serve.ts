import pc from "picocolors";
import { defaultRegistry, defaultSkillsRoot } from "../paths.js";
import { renderBanner, tagline } from "../ui/banner.js";
import { createGarryServer, type ServerConfig } from "../server/server.js";

const FLAGS = ["port", "registry", "skills", "routing", "root"] as const;

const HELP = `garry serve [options]

Start the Garry HTTP server (REST plus SSE) over the supervisor. The UI uses it
to list features, fetch a plan and watch the live delegation stream.

Options:
  --port <n>         port (default: 8123)
  --registry <path>  registry root (default: the monorepo sample, ./registry or a sample copy)
  --skills <path>    skills root (default: ./garry-skills or the bundled skills)
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
  const cfg: ServerConfig = {
    registry: values.registry ?? defaultRegistry(),
    skills: values.skills ?? defaultSkillsRoot(),
    routing: values.routing ?? "garry.routing.json",
    root: values.root,
  };

  console.log("\n" + renderBanner());
  console.log(tagline() + "\n");

  const server = createGarryServer(cfg);
  server.listen(port, () => {
    console.log(pc.green(`garry-server listening on http://localhost:${port}`));
    console.log(pc.dim(`registry: ${cfg.registry}  skills: ${cfg.skills}  routing: ${cfg.routing}`));
  });
}
