/**
 * Regression test for talking to Garry: messages wait in line and run one at a
 * time, in one conversation per repository (the agent resumes its session, so
 * it remembers), a new message never interrupts the work in progress (nor your
 * own turn in Build), a waiting message can be dropped and a running one not,
 * Garry's answer is the agent's own words, a restart loses nothing, and the
 * HTTP routes. A stand-in for Claude Code runs the turns.
 * Run with: pnpm -C garry-tool test:queue (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-queue-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../threads/testdata/fake-claude.mjs", import.meta.url));

const { GarryQueue } = await import("./queue.js");
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
const repo = (name: string) => {
  const dir = join(home, name);
  execFileSync("git", ["init", "-q", dir]);
  writeFileSync(join(dir, "README.md"), `# ${name}\n`);
  execFileSync("git", ["-C", dir, "add", "-A"]);
  execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
  return dir;
};

const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const shop = threads.store.addProject(repo("shop"), "Shop");
const queue = new GarryQueue(threads);
const status = (id: string) => queue.get(id)?.status;

// in line: the first works, the rest wait
const one = queue.add("BUSY add a checkout page", shop.id);
const two = queue.add("ASK add a buy button", shop.id);
const three = queue.add("write the release notes", shop.id);
await until(() => threads.store.events(one.threadId!).some((e) => e.type === "tool"));
expect("the first message starts at once", status(one.id) === "running" && !!one.threadId && threads.isRunning(one.threadId!));
expect("the others wait their turn, in order", status(two.id) === "queued" && status(three.id) === "queued" && queue.list().map((i) => i.id).join() === [one.id, two.id, three.id].join());
expect("waiting does not touch the work in progress", threads.store.events(one.threadId!).filter((e) => e.type === "user").length === 1);

// a waiting message can be dropped; a running one cannot
const four = queue.add("never mind this one", shop.id);
expect("a waiting message can be dropped", queue.cancel(four.id) && status(four.id) === "cancelled");
expect("a running one cannot (stop it in Build)", !queue.cancel(one.id) && status(one.id) === "running");

// the first ends (stopped): the next starts, in the same conversation
threads.stop(one.threadId!);
await until(() => status(one.id) !== "running");
expect("a stopped turn is failed, saying so", status(one.id) === "failed" && !!queue.get(one.id)?.error);
await until(() => status(two.id) === "done", 15_000);
expect("then the next runs, in the same conversation", queue.get(two.id)?.threadId === one.threadId && threads.store.events(one.threadId!).filter((e) => e.type === "user").map((e) => (e as { text: string }).text).slice(0, 2).join(" | ") === "BUSY add a checkout page | ASK add a buy button");
expect("Garry's answer is the agent's own words", queue.get(two.id)?.reply === "I added the button.\nShould it be red or blue?", queue.get(two.id)?.reply);
await until(() => status(three.id) === "done", 15_000);
expect("and the one after it, resuming the session (it remembers)", queue.get(three.id)?.reply === "resumed fake-session-1", queue.get(three.id)?.reply);
expect("never two at once", !queue.list().some((i) => i.id !== three.id && i.status === "running"));

// your own turn in Build: Garry waits for it
const garryThread = one.threadId!;
threads.send(garryThread, "BUSY you, directly in Build");
await until(() => threads.store.events(garryThread).filter((e) => e.type === "tool").length >= 4);
const five = queue.add("after you", shop.id);
await new Promise((r) => setTimeout(r, 400));
expect("a message waits while you talk to that agent yourself", status(five.id) === "queued" && threads.store.events(garryThread).filter((e) => e.type === "user").length === 4);
threads.stop(garryThread);
await until(() => status(five.id) === "done", 15_000);
expect("and goes once your turn ends", status(five.id) === "done");

// another repository: its own conversation
const blog = threads.store.addProject(repo("blog"), "Blog");
const six = queue.add("write a post", blog.id);
await until(() => status(six.id) === "done", 15_000);
expect("each repository has its own conversation", !!queue.get(six.id)?.threadId && queue.get(six.id)?.threadId !== garryThread);

// a restart loses nothing: what waits still waits, a cut off turn is failed
const seven = queue.add("BUSY a long one", shop.id);
const eight = queue.add("then this", shop.id);
await until(() => status(seven.id) === "running");
queue.close();
const fresh = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const again = new GarryQueue(fresh);
expect("after a restart a cut off turn is failed, the waiting one goes on", again.get(seven.id)?.status === "failed" && ["running", "done"].includes(again.get(eight.id)?.status ?? ""), `${again.get(seven.id)?.status} ${again.get(eight.id)?.status}`);
await until(() => again.get(eight.id)?.status === "done", 15_000);
again.close();
threads.stop(seven.threadId!);
expect("an empty message is refused", (() => { try { queue.add("  ", shop.id); return false; } catch { return true; } })());

// over HTTP
const server = createGarryServer({ registry: join(home, "reg"), skills: join(home, "none"), routing: join(home, "none.json"), threads }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const listed = (await fetch(`${base}/api/garry/queue`).then((r) => r.json())) as { items: { id: string }[]; repos: { id: string }[] };
expect("GET lists what you said and where it can go", listed.items.length > 0 && listed.repos.some((r) => r.id === shop.id));
const posted = (await fetch(`${base}/api/garry/queue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "BUSY over http" }) }).then((r) => r.json())) as { id: string; projectId: string };
expect("POST puts it in line, for the first repository when none is named", posted.projectId === shop.id);
const waiting = (await fetch(`${base}/api/garry/queue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "and then", projectId: blog.id }) }).then((r) => r.json())) as { id: string };
const del = await fetch(`${base}/api/garry/queue/${waiting.id}`, { method: "DELETE" });
expect("DELETE drops one that waits", del.status === 200);
const bad = await fetch(`${base}/api/garry/queue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "x", projectId: "nope1234" }) });
expect("a repository outside the project is refused", bad.status === 400);
const hostile = await fetch(`${base}/api/garry/queue`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ text: "rm -rf" }) });
expect("another website cannot tell Garry anything", hostile.status === 403);
for (const t of threads.store.threads()) threads.stop(t.id);
server.close();

if (failed) {
  console.error(`${failed} queue check(s) failed`);
  process.exit(1);
}
console.log("Talking to Garry behaves as expected");
process.exit(0);
