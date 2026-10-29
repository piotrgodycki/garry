/**
 * Regression test for layers: what agents are given, set for the whole Garry
 * project and changed per repository and per service. Saving and reading
 * layers, how they add up (skills on and off, stacks, notes, boards), skills
 * installed for one layer only, the HTTP routes, and what an agent turn
 * actually receives (a stand-in for Claude Code records its arguments).
 * Run with: pnpm -C garry-tool test:layers (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-layers-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_SKILLS_HOME = join(home, "skills");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../threads/testdata/fake-claude.mjs", import.meta.url));
const argsLog = join(home, "args.jsonl");
process.env.GARRY_FAKE_ARGS = argsLog;

const { LayerError, parseScope, readLayers, resolveLayers, saveLayer } = await import("./layers.js");
const { addService } = await import("./services.js");
const { saveStack } = await import("./stacks.js");
const { saveArchitecture } = await import("./architecture.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const throws = (fn: () => unknown) => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof LayerError;
  }
};

// --- how layers add up, without a server
const registry = join(home, "reg");
expect("no file reads as empty layers", JSON.stringify(readLayers(registry)) === JSON.stringify({ project: { skills: [], skillsOff: [], stacks: [], notes: "" }, repos: {}, services: {} }));
expect("a scope must be the project, or a repository or service with a safe name", throws(() => parseScope({ level: "repo", name: "../etc" })) && throws(() => parseScope({ level: "team" })) && throws(() => parseScope({ level: "service" })) && parseScope({ level: "service", name: "api" }).level === "service");
expect("a layer that is not one is refused", throws(() => saveLayer(registry, { level: "project" }, { skills: "a11y" })));

saveLayer(registry, { level: "project" }, { skills: ["a11y", "a11y", " docs "], stacks: ["web"], notes: "  Write in British English.  " });
saveLayer(registry, { level: "repo", name: "shop" }, { skills: ["perf"], skillsOff: ["docs"], notes: "Shop ships every Friday." });
let l = readLayers(registry);
expect("saved layers are tidied: doubles, spaces", JSON.stringify(l.project.skills) === '["a11y","docs"]' && l.project.notes === "Write in British English.");
saveLayer(registry, { level: "repo", name: "blog" }, { skills: ["x"] });
saveLayer(registry, { level: "repo", name: "blog" }, {});
expect("an emptied repository layer leaves the file", !("blog" in readLayers(registry).repos) && "shop" in readLayers(registry).repos);

l = readLayers(registry);
const shop = resolveLayers(l, { repo: "shop", services: [{ name: "api", stackRef: "node-api" }], everywhere: ["house-style"] });
const from = (xs: { name: string; from: string }[]) => Object.fromEntries(xs.map((x) => [x.name, x.from]));
expect("skills add up: every project, the project, the repository", JSON.stringify(from(shop.skills)) === JSON.stringify({ "house-style": "everywhere", a11y: "project", perf: "repo:shop" }), JSON.stringify(shop.skills));
expect("a repository turns off a skill the project turned on", !shop.skills.some((s) => s.name === "docs"));
expect("a repository with no stacks of its own keeps the project's; a service adds the stack it is built with", JSON.stringify(from(shop.stacks)) === JSON.stringify({ web: "project", "node-api": "service:api" }), JSON.stringify(shop.stacks));
expect("notes, widest first", shop.notes.map((n) => n.from).join() === "project,repo:shop");
expect("the boards: the whole project's, then the repository's", JSON.stringify(shop.boards) === '["","shop"]');
expect("another repository is not given what shop turned on", !resolveLayers(l, { repo: "blog", services: [], everywhere: [] }).skills.some((s) => s.name === "perf"));

saveLayer(registry, { level: "repo", name: "shop" }, { skills: ["perf"], stacks: ["mobile"] });
saveLayer(registry, { level: "service", name: "api" }, { skills: ["sql-review"], skillsOff: ["a11y"], notes: "The API is public." });
l = readLayers(registry);
const one = resolveLayers(l, { repo: "shop", services: [{ name: "api" }], everywhere: [] });
expect("a repository's stacks replace the project's", JSON.stringify(one.stacks.map((s) => s.name)) === '["mobile"]');
expect("a service adds skills and, as the only one in the repository, can turn one off", one.skills.some((s) => s.name === "sql-review" && s.from === "service:api") && !one.skills.some((s) => s.name === "a11y"));
const two = resolveLayers(l, { repo: "shop", services: [{ name: "api" }, { name: "web" }], everywhere: [] });
expect("with two services in the repository, one service cannot take a skill from the other", two.skills.some((s) => s.name === "a11y"));

// --- the server: skills installed for one layer, the routes, what an agent turn gets
// the folder is not named like the repository, so the service at its path is found by the path
const repo = join(home, "shop-checkout");
execFileSync("git", ["init", "-q", repo]);
writeFileSync(join(repo, "README.md"), "# shop\n");
execFileSync("git", ["-C", repo, "add", "-A"]);
execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
const reg2 = join(home, "reg2");
const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const shopRepo = threads.store.addProject(repo, "shop");
addService(reg2, { name: "api", kind: "backend", repo });
addService(reg2, { name: "worker", kind: "worker", repo: "https://github.com/acme/shop.git" });
addService(reg2, { name: "blog-api", kind: "backend", repo: "https://github.com/acme/blog.git" });
saveStack(reg2, { name: "node-api", description: "Our API stack", technologies: [{ id: "typescript" }, { id: "postgres", version: "16" }] });
saveArchitecture(reg2, { nodes: [{ id: "db", block: "postgres", label: "Orders DB", x: 0, y: 0 }, { id: "api", block: "service:api", x: 1, y: 0 }], edges: [{ from: "api", to: "db", capability: "sql" }] });

// Garry's own skills: none here, so only what is installed counts
const builtin = join(home, "builtin");
mkdirSync(builtin, { recursive: true });
writeFileSync(join(builtin, "manifest.json"), JSON.stringify({ skills: [] }));
const server = createGarryServer({ registry: reg2, skills: builtin, routing: join(home, "none.json"), threads }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const md = (name: string) => `---\nname: ${name}\ndescription: Checks ${name} in the changed files.\nstage: review\n---\n\nRead the diff and check ${name}.\n`;

let r = await call("POST", "/api/skills/install", { content: md("tone-check"), scope: { level: "project" } });
expect("a skill installed for the project", r.status === 200 && r.body.installed === true, JSON.stringify(r.body));
expect("is turned on in the project's layer", readLayers(reg2).project.skills.includes("tone-check"));
const sidecar = (n: string) => JSON.parse(readFileSync(join(home, "skills", n, "garry.json"), "utf8")) as { everywhere: boolean };
expect("and not given to every project", sidecar("tone-check").everywhere === false);
r = await call("POST", "/api/skills/install", { content: md("house-style") });
expect("a skill installed with no scope goes to every project", r.status === 200 && sidecar("house-style").everywhere === true && !readLayers(reg2).project.skills.includes("house-style"));
r = await call("POST", "/api/skills/install", { content: md("bad-scope"), scope: { level: "repo", name: "../x" } });
expect("a bad scope installs nothing", r.status === 400 && !existsSync(join(home, "skills", "bad-scope")), JSON.stringify(r));
r = await call("POST", "/api/skills/install", { content: md("for-blog"), scope: { level: "repo", name: "blog" } });
expect("a skill installed for one repository", r.status === 200 && readLayers(reg2).repos.blog?.skills.includes("for-blog") === true);

r = await call("POST", "/api/layers", { scope: { level: "repo", name: "shop" }, layer: { skills: ["sql-review"], skillsOff: ["house-style"], stacks: [], notes: "Run the tests before you finish." } });
expect("a repository's layer saved over HTTP", r.status === 200 && (r.body.layer as { notes: string }).notes === "Run the tests before you finish.");
expect("and a bad one refused", (await call("POST", "/api/layers", { scope: { level: "repo", name: "shop" }, layer: { notes: 4 } })).status === 400);
await call("POST", "/api/layers", { scope: { level: "service", name: "api" }, layer: { skills: [], skillsOff: [], stacks: ["node-api"], notes: "" } });
r = await call("GET", "/api/layers");
const listed = r.body.services as { name: string; inRepo: string | null }[];
expect("the layers list the repositories, and the services with the repository each lives in", JSON.stringify((r.body.repos as { name: string }[]).map((x) => x.name)) === '["shop"]' && JSON.stringify(listed.map((s) => [s.name, s.inRepo])) === '[["api","shop"],["blog-api",null],["worker","shop"]]', JSON.stringify(listed));

r = await call("GET", `/api/layers/agent?repo=${shopRepo.id}`);
const ctx = r.body as { skills: { name: string; from: string }[]; missing: string[]; services: string[]; prompt: string; dirs: string[] };
expect("what an agent in shop gets: the project's skill, not the one turned off, not blog's", JSON.stringify(ctx.skills.map((s) => s.name)) === '["tone-check"]', JSON.stringify(ctx.skills));
expect("a skill a layer names that is not installed is reported", JSON.stringify(ctx.missing) === '["sql-review"]');
expect("the services in the repository: at its path, or with a remote named like it", JSON.stringify(ctx.services) === '["api","worker"]', JSON.stringify(ctx.services));
expect("the prompt names the stack and its technologies", ctx.prompt.includes("node-api (service api): typescript, postgres@16. Our API stack"), ctx.prompt);
expect("the architecture and its connections", ctx.prompt.includes("Orders DB") && ctx.prompt.includes("needs Orders DB"));
expect("the skill and where to read it", ctx.prompt.includes(`tone-check: Checks tone-check in the changed files. (${join(home, "skills", "tone-check")}/SKILL.md; from the project)`), ctx.prompt);
expect("the team's notes", ctx.prompt.includes("Notes from the team for this repository:\nRun the tests before you finish."));
expect("an unknown repository is a 404", (await call("GET", "/api/layers/agent?repo=nope")).status === 404);

// an agent turn: the stand-in records what it was given
const lines = () => (existsSync(argsLog) ? readFileSync(argsLog, "utf8").trim().split("\n").filter(Boolean).map((x) => JSON.parse(x) as { system: string; dirs: string[] }) : []);
const t = await call("POST", "/api/threads", { projectId: shopRepo.id, prompt: "add a buy button" });
const waitFor = async (n: number) => {
  for (let i = 0; i < 200 && lines().length < n; i++) await new Promise((res) => setTimeout(res, 50));
  return lines()[n - 1];
};
const first = await waitFor(1);
expect("the agent gets Garry's rules and then the layers", !!first && first.system.startsWith("You are working for Garry") && first.system.includes("Run the tests before you finish.") && first.system.includes("tone-check"), JSON.stringify(first));
expect("and may read its skills' folders", !!first && JSON.stringify(first.dirs) === JSON.stringify([join(home, "skills", "tone-check")]), JSON.stringify(first?.dirs));

// a layer that cannot be worked out never stops an agent
const wired = threads.context;
threads.context = () => {
  throw new Error("the registry is gone");
};
for (let i = 0; i < 100 && threads.store.get(String(t.body.id))?.status === "running"; i++) await new Promise((res) => setTimeout(res, 50));
await call("POST", `/api/threads/${t.body.id}/messages`, { text: "and a price" });
const plain = await waitFor(2);
expect("when the layers cannot be read the agent still works, with Garry's rules alone", !!plain && plain.system.startsWith("You are working for Garry") && !plain.system.includes("tone-check"), JSON.stringify(plain));
threads.context = wired;

// a broken layers file never stops an agent
writeFileSync(join(reg2, "layers.json"), "{ not json");
for (let i = 0; i < 100 && threads.store.get(String(t.body.id))?.status === "running"; i++) await new Promise((res) => setTimeout(res, 50));
await call("POST", `/api/threads/${t.body.id}/messages`, { text: "and a cancel button" });
const second = await waitFor(3);
expect("with a broken layers file the agent still works, given what every project gets", !!second && second.system.includes("house-style") && !second.system.includes("tone-check"), JSON.stringify(second));

server.close();
console.log(failed ? `${failed} check(s) failed` : "Layers behave as expected");
process.exit(failed ? 1 : 0);
