/**
 * Regression test for Garry at a glance: real threads run by a stand-in for
 * Claude Code, each ending a different way, and the status the menu bar and
 * the iPhone app read (working, needs you, ready, nothing) both directly
 * and over /api/status. Run with: pnpm -C garry-tool test:status (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-status-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../threads/testdata/fake-claude.mjs", import.meta.url));

const { asksSomething, garryStatus, statusChanges } = await import("./status.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const until = async (f: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return f();
};

// what counts as a question
expect("a last line ending in ? is a question", asksSomething("Done.\nShould it be red or blue?") && asksSomething("Which one?**"));
expect("a question earlier on is not", !asksSomething("Should I? I did it anyway.\nAll done."));
expect("nothing is not a question", !asksSomething(""));

const repo = join(home, "repo");
execFileSync("git", ["init", "-q", repo]);
writeFileSync(join(repo, "README.md"), "# demo\n");
execFileSync("git", ["-C", repo, "add", "-A"]);
execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);

const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const project = threads.store.addProject(repo);
expect("nothing in flight is idle", garryStatus(threads).state === "idle");

// everything that happens reaches one listener (the menu bar)
const seen: string[] = [];
const stop = threads.subscribeAll((id, e) => seen.push(`${id}:${e.type}`));

const asks = threads.create(project.id, "add a button ASK");
const fails = threads.create(project.id, "break it FAIL");
const fine = threads.create(project.id, "write the notes");
await until(() => !threads.isRunning(asks.id) && !threads.isRunning(fails.id) && !threads.isRunning(fine.id));
const byId = (s: ReturnType<typeof garryStatus>, id: string) => s.items.find((i) => i.threadId === id);
let s = garryStatus(threads);
expect("a turn ending in a question needs you", byId(s, asks.id)?.state === "needs-you" && byId(s, asks.id)!.detail.includes("red or blue"));
expect("a turn that failed needs you", byId(s, fails.id)?.state === "needs-you" && /Stopped/.test(byId(s, fails.id)!.detail));
expect("a turn that ended well is ready for review", byId(s, fine.id)?.state === "done");
expect("needs you wins overall and comes first", s.state === "needs-you" && s.counts.needsYou === 2 && s.counts.done === 1 && s.items[0].state === "needs-you");
expect("the listener heard every thread", [asks.id, fails.id, fine.id].every((id) => seen.includes(`${id}:turn_end`)));

// notifications: what changed between two looks
const before = garryStatus(threads);
expect("the first look announces what waits", statusChanges(null, before).length === 3);
expect("looking again announces nothing", statusChanges(before, garryStatus(threads)).length === 0);

// answering the question: the follow-up ends well, so it is ready
threads.send(asks.id, "blue, thanks");
await until(() => !threads.isRunning(asks.id));
expect("an answered question is ready again", byId(garryStatus(threads), asks.id)?.state === "done");
const changed = statusChanges(before, garryStatus(threads));
expect("then exactly that thread is news", changed.length === 1 && changed[0].threadId === asks.id && changed[0].state === "done");

// committed work waits on nobody
threads.commit(fine.id, "notes");
expect("committed work leaves the list", !byId(garryStatus(threads), fine.id));

// a turn in progress is working
const slow = threads.create(project.id, "SLOW job");
await until(() => threads.isRunning(slow.id));
s = garryStatus(threads);
expect("a running turn is working", byId(s, slow.id)?.state === "working");
expect("working is not news", !statusChanges(null, s).some((i) => i.threadId === slow.id));
stop();

// over HTTP: what the menu bar and the iPhone app read
const server = createGarryServer({ registry: join(home, "reg"), skills: join(home, "none"), routing: join(home, "none.json"), threads }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const api = (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/status`).then((r) => r.json())) as ReturnType<typeof garryStatus>;
const port = (server.address() as AddressInfo).port;
const listed = (await fetch(`http://127.0.0.1:${port}/api/threads`).then((r) => r.json())) as { threads: { id: string; attention: string | null }[] };
expect("the thread list carries the same reading", listed.threads.find((t) => t.id === slow.id)?.attention === "working" && listed.threads.find((t) => t.id === fails.id)?.attention === "needs-you");
expect("GET /api/status says the same", api.state === s.state && api.items.length === s.items.length && api.counts.working === 1);
threads.stop(slow.id);
server.close();

if (failed) {
  console.error(`${failed} status check(s) failed`);
  process.exit(1);
}
console.log("Garry's status behaves as expected");
process.exit(0);
