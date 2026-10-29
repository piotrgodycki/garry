/**
 * Regression test for Garry's memory and the commands typed after a slash:
 * remembering (once, within limits), forgetting by number, id or words, the
 * memory reaching every agent's instructions, and each command (/remember,
 * /forget, /memory, /new, /pair, /stop, /help) through the server, with the
 * page it leads to. A stand-in for Claude Code runs the agents.
 * Run with: pnpm -C garry-tool test:commands (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-commands-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../threads/testdata/fake-claude.mjs", import.meta.url));
const argsLog = join(home, "args.jsonl");
process.env.GARRY_FAKE_ARGS = argsLog;

const { MAX_ENTRIES, MemoryError, forget, memoryPrompt, readMemory, remember } = await import("./memory.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const status = (fn: () => unknown) => {
  try {
    fn();
    return 200;
  } catch (e) {
    return e instanceof MemoryError ? e.status : 500;
  }
};

// --- memory on its own
const reg = join(home, "reg");
expect("nothing remembered at first, and agents get nothing", readMemory(reg).length === 0 && memoryPrompt(reg) === "");
const first = remember(reg, "  We deploy   on Fridays ");
expect("remembered, tidied", first.text === "We deploy on Fridays" && readMemory(reg).length === 1);
expect("the same thing twice is kept once", remember(reg, "we deploy on fridays").id === first.id && readMemory(reg).length === 1);
expect("empty, or too long, is refused", status(() => remember(reg, "  ")) === 400 && status(() => remember(reg, "x".repeat(501))) === 400);
remember(reg, "Prices are in euros");
remember(reg, "Prices never include tax");
expect("agents read it numbered, oldest first", memoryPrompt(reg) === "What the team asked Garry to remember about this project:\n1. We deploy on Fridays\n2. Prices are in euros\n3. Prices never include tax");
expect("words that match two things are not enough", status(() => forget(reg, "prices")) === 409 && readMemory(reg).length === 3);
expect("nothing matching is a 404", status(() => forget(reg, "kubernetes")) === 404);
expect("forgotten by its number", forget(reg, "2").text === "Prices are in euros" && readMemory(reg).length === 2);
expect("and by words only it has", forget(reg, "tax").text === "Prices never include tax" && readMemory(reg).map((e) => e.text).join() === "We deploy on Fridays");
const full = join(home, "full");
for (let i = 0; i < MAX_ENTRIES; i++) remember(full, `thing ${i}`);
expect("up to a limit", status(() => remember(full, "one more")) === 409 && readMemory(full).length === MAX_ENTRIES);
writeFileSync(join(home, "broken.json"), "");
expect("an unreadable file reads as nothing remembered", readMemory(join(home, "nowhere")).length === 0);

// --- through the server
const repo = join(home, "shop");
execFileSync("git", ["init", "-q", repo]);
writeFileSync(join(repo, "README.md"), "# shop\n");
execFileSync("git", ["-C", repo, "add", "-A"]);
execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const shop = threads.store.addProject(repo, "shop");
const registry = join(home, "registry");
const server = createGarryServer({ registry, skills: join(home, "none"), routing: join(home, "none.json"), threads }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const cmd = (text: string) => call("POST", "/api/garry/commands", { text });
const until = async (f: () => boolean, ms = 15_000) => {
  const end = Date.now() + ms;
  while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return f();
};

const list = (await call("GET", "/api/garry/commands")).body.commands as { name: string; args: string; help: string }[];
expect("the commands, for the field's suggestions", JSON.stringify(list.map((c) => c.name)) === '["remember","forget","memory","new","pair","stop","help"]' && list.every((c) => c.help));
let r = await cmd("/remember Checkout must work without JavaScript");
expect("/remember answers and keeps it in the project", r.status === 200 && r.body.message === "I will remember: Checkout must work without JavaScript" && readMemory(registry).length === 1);
r = await cmd("/memory");
expect("/memory says how much and opens Memory", r.body.message === "I remember 1 thing about this project." && r.body.open === "/memory");
expect("GET /api/garry/memory lists it", ((await call("GET", "/api/garry/memory")).body.entries as { text: string }[])[0]?.text === "Checkout must work without JavaScript");
const added = (await call("POST", "/api/garry/memory", { text: "Support answers within a day" })).body as { id: string };
expect("added from the Memory page too", readMemory(registry).length === 2);

r = await cmd("/new BUSY add a buy button");
const t = threads.store.threads().find((x) => x.title.includes("add a buy button"));
expect("/new starts a job in the project's repository and opens it", r.status === 200 && !!t && t.projectId === shop.id && r.body.open === `/build/${t.id}`, JSON.stringify(r.body));
await until(() => existsSync(argsLog));
const given = existsSync(argsLog) ? (JSON.parse(readFileSync(argsLog, "utf8").split("\n")[0]) as { system: string }).system : "";
expect("every agent is given the memory", given.includes("What the team asked Garry to remember about this project:\n1. Checkout must work without JavaScript\n2. Support answers within a day"), given);
threads.stop(t!.id);

expect("/stop with nothing of Garry's running says so", (await cmd("/stop")).body.message === "Garry is not working on anything right now.");
await call("POST", "/api/garry/queue", { text: "BUSY tidy the cart" });
await until(() => (cfgQueueRunning() ?? false));
function cfgQueueRunning() {
  const items = threads.store.threads().filter((x) => x.title.startsWith("Garry: BUSY tidy the cart"));
  return items.length > 0 && threads.isRunning(items[0].id);
}
r = await cmd("/stop");
await until(() => !cfgQueueRunning(), 5000);
expect("/stop stops what Garry is working on", r.body.message === "Stopped: BUSY tidy the cart" && !cfgQueueRunning(), JSON.stringify(r.body));

r = await cmd("/pair PAIR1 add a wishlist");
expect("/pair starts a job with a reviewer and opens the writer", r.status === 200 && typeof r.body.open === "string" && (r.body.open as string).startsWith("/build/") && String(r.body.message).startsWith("Started with a reviewer"));
r = await cmd(`/forget ${added.id}`);
expect("/forget by id", r.body.message === "Forgotten: Support answers within a day" && readMemory(registry).length === 1);
expect("DELETE /api/garry/memory/:id forgets one", (await call("DELETE", `/api/garry/memory/${readMemory(registry)[0].id}`)).status === 200 && readMemory(registry).length === 0);
r = await cmd("/forget nothing like this");
expect("/forget with no match is a 404 that says so", r.status === 404 && /nothing remembered matches/.test(String(r.body.error)));
expect("/new with nothing to do says what to add", (await cmd("/new")).status === 400);
const help = String((await cmd("/help")).body.message);
expect("/help lists every command with what goes after it", list.every((c) => help.includes(`/${c.name}`)) && help.includes("/remember <what to keep in mind>"));
expect("an unknown command is a 404", (await cmd("/deploy now")).status === 404);
expect("text without a slash is not run", (await cmd("remember this")).status === 400);

server.close();
for (const x of threads.store.threads()) threads.stop(x.id);
console.log(failed ? `${failed} check(s) failed` : "Garry's memory and commands behave as expected");
process.exit(failed ? 1 : 0);
