/**
 * Regression test for agents working together: a pair (a writer, then a
 * reviewer that answers APPROVED or CHANGES, the writer fixing until approved
 * or out of rounds), and a chain (steps in order, each its own agent in one
 * working copy, the next starting when the one before is done; steps added,
 * dropped and reordered while they wait; a chain started after work already
 * done; a question pausing it until your answer's turn ends well). And the
 * HTTP routes. A stand-in for Claude Code runs the turns.
 * Run with: pnpm -C garry-tool test:teams (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-teams-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../threads/testdata/fake-claude.mjs", import.meta.url));

const { Teams } = await import("./teams.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const until = async (f: () => boolean, ms = 15_000) => {
  const end = Date.now() + ms;
  while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return f();
};

const repo = join(home, "shop");
execFileSync("git", ["init", "-q", repo]);
writeFileSync(join(repo, "README.md"), "# shop\n");
execFileSync("git", ["-C", repo, "add", "-A"]);
execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const shop = threads.store.addProject(repo, "Shop");
const teams = new Teams(threads);
const said = (id: string) => threads.store.events(id).filter((e) => e.type === "user").map((e) => (e as { text: string }).text);
const pairOf = (id: string) => teams.pairs().find((p) => p.id === id)!;
const chainOf = (id: string) => teams.chains().find((c) => c.id === id)!;

// a pair: the reviewer asks for changes once, then approves
const pair = teams.startPair(shop.id, "PAIR2 add a buy button");
await until(() => pairOf(pair.id).status === "approved");
const p = pairOf(pair.id);
expect("a pair goes write, review, fix, review, approved", p.status === "approved" && p.round === 1, JSON.stringify(p));
expect("the writer got the reviewer's changes as its next message", said(p.writer).length === 2 && said(p.writer)[1].startsWith("The reviewer asks for these changes:\n- rename the button (round 1)"), said(p.writer).join(" | "));
expect("the reviewer looked twice, in its own conversation", !!p.reviewer && said(p.reviewer!).length === 2 && said(p.reviewer!)[0].startsWith("[review]"));
const writer = threads.store.get(p.writer)!;
const reviewer = threads.store.get(p.reviewer!)!;
expect("the reviewer works in the writer's own working copy", reviewer.worktree === writer.worktree && reviewer.branch === writer.branch && reviewer.sharesWith === writer.id && reviewer.role === "reviewer");
expect("the last review is kept", p.lastReview?.startsWith("APPROVED") === true);

// out of rounds: the pair stops and waits for you
const stubborn = teams.startPair(shop.id, "PAIR9 refactor the cart", 2);
await until(() => pairOf(stubborn.id).status === "needs-you");
expect("out of rounds, the pair waits for you", pairOf(stubborn.id).status === "needs-you" && pairOf(stubborn.id).round === 2 && said(pairOf(stubborn.id).writer).length === 2, JSON.stringify(pairOf(stubborn.id)));

// a writer that asks you something: no review until your answer's turn ends well
const asking = teams.startPair(shop.id, "PAIR1 ASK add a wish list");
await until(() => pairOf(asking.id).status === "needs-you");
expect("a writer that asks you something makes the pair wait, with no review yet", pairOf(asking.id).status === "needs-you" && !pairOf(asking.id).reviewer);
threads.send(pairOf(asking.id).writer, "a heart icon, please");
await until(() => pairOf(asking.id).status === "approved");
expect("answered, the review follows and approves", pairOf(asking.id).status === "approved" && !!pairOf(asking.id).reviewer);

// a chain: steps in order, one working copy, each its own agent
const chain = teams.startChain(shop.id, ["write the spec", "BUSY build it", "write the tests", "write the notes"], "Checkout");
await until(() => chainOf(chain.id).steps[1].status === "running" && threads.store.events(chainOf(chain.id).steps[1].threadId!).some((e) => e.type === "tool"));
let c = chainOf(chain.id);
expect("the first step ran, the second runs, the rest wait", c.steps.map((s) => s.status).join() === "done,running,waiting,waiting", c.steps.map((s) => s.status).join());
const first = threads.store.get(c.steps[0].threadId!)!;
const second = threads.store.get(c.steps[1].threadId!)!;
expect("the next step builds on the work: the same working copy, its own agent", second.id !== first.id && second.worktree === first.worktree && second.sharesWith === first.id && second.role === "step");
expect("the step agent sees the work before it", readFileSync(join(first.worktree, "NOTES.md"), "utf8").startsWith("write the spec\n"));
// while waiting: reorder, drop, add
const [, , tests, notes] = c.steps;
teams.reorder(chain.id, [notes.id, tests.id]);
expect("waiting steps can be put in another order", chainOf(chain.id).steps.map((s) => s.prompt).join(" > ") === "write the spec > BUSY build it > write the notes > write the tests");
let refused = false;
try {
  teams.reorder(chain.id, [tests.id]);
} catch {
  refused = true;
}
expect("an order must name every waiting step", refused);
teams.dropStep(chain.id, tests.id);
teams.addStep(chain.id, "ASK update the changelog");
expect("a waiting step can be dropped, and one added at the end", chainOf(chain.id).steps.map((s) => `${s.prompt}:${s.status}`).join(" > ") === "write the spec:done > BUSY build it:running > write the notes:waiting > write the tests:dropped > ASK update the changelog:waiting");
refused = false;
try {
  teams.dropStep(chain.id, chainOf(chain.id).steps[1].id);
} catch {
  refused = true;
}
expect("a running step cannot be dropped (stop it in Build)", refused);
threads.stop(second.id);
await until(() => chainOf(chain.id).status === "needs-you");
expect("a step that stopped makes the chain wait for you", chainOf(chain.id).steps[1].status === "needs-you" && chainOf(chain.id).steps[2].status === "waiting");
threads.send(second.id, "go on");
await until(() => chainOf(chain.id).status === "needs-you" && chainOf(chain.id).steps[4].status === "needs-you");
c = chainOf(chain.id);
expect("once your answer's turn ends well it goes on, in your order", c.steps[1].status === "done" && c.steps[2].status === "done" && said(c.steps[2].threadId!)[0] === "write the notes", c.steps.map((s) => `${s.prompt}:${s.status}`).join(" > "));
expect("a step that asks you something pauses the chain", c.steps[4].status === "needs-you" && c.status === "needs-you");
threads.send(c.steps[4].threadId!, "yes, do it");
await until(() => chainOf(chain.id).status === "done");
expect("answered, the chain is done", chainOf(chain.id).status === "done");
teams.addStep(chain.id, "and one more thing");
await until(() => chainOf(chain.id).status === "done" && chainOf(chain.id).steps.length === 6 && chainOf(chain.id).steps[5].status === "done");
expect("a step added to a finished chain runs it again", chainOf(chain.id).steps[5].status === "done");

// a chain after work already done, by hand
const mine = threads.create(shop.id, "add the footer");
await until(() => !threads.isRunning(mine.id));
const after = teams.startChain(shop.id, ["review the footer"], "", mine.id);
await until(() => chainOf(after.id).status === "done");
const a = chainOf(after.id);
expect("a chain can start after work already done, in its working copy", a.steps[0].threadId === mine.id && a.steps[0].status === "done" && threads.store.get(a.steps[1].threadId!)?.worktree === mine.worktree);

// stopping: nothing more starts
const stopped = teams.startChain(shop.id, ["BUSY one", "two"]);
await until(() => chainOf(stopped.id).steps[0].status === "running");
teams.stopChain(stopped.id);
threads.stop(chainOf(stopped.id).steps[0].threadId!);
await new Promise((r) => setTimeout(r, 600));
expect("a stopped chain starts nothing more", chainOf(stopped.id).status === "stopped" && chainOf(stopped.id).steps[1].status === "dropped" && !chainOf(stopped.id).steps[1].threadId);

// removing a reviewer leaves the writer's working copy
threads.remove(reviewer.id);
expect("removing an agent that joined leaves the working copy to its owner", existsSync(join(writer.worktree, "NOTES.md")));
teams.close();

// over HTTP
const server = createGarryServer({ registry: join(home, "reg"), skills: join(home, "none"), routing: join(home, "none.json"), threads }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const listed = (await (await fetch(`${base}/api/teams`)).json()) as { pairs: unknown[]; chains: unknown[] };
expect("GET /api/teams lists the pairs and chains", listed.pairs.length === 3 && listed.chains.length === 3);
const viaHttp = (await (await post("/api/chains", { steps: ["BUSY first", "second"] })).json()) as { id: string; steps: { id: string }[] };
expect("POST /api/chains starts one in the project's first repository", !!viaHttp.id);
const added = (await (await post(`/api/chains/${viaHttp.id}/steps`, { prompt: "third" })).json()) as { steps: { id: string; prompt: string }[] };
const order = await post(`/api/chains/${viaHttp.id}/order`, { order: [added.steps[2].id, added.steps[1].id] });
expect("and its steps are added and reordered over HTTP", order.status === 200 && ((await order.json()) as { steps: { prompt: string }[] }).steps.map((s) => s.prompt).join() === "BUSY first,third,second");
expect("a bad pair is refused", (await post("/api/pairs", { task: "" })).status === 400 && (await post("/api/pairs", { task: "x", rounds: 99 })).status === 400);
expect("a chain of nothing is refused", (await post("/api/chains", { steps: [] })).status === 400);
expect("another website cannot start agents", (await fetch(`${base}/api/pairs`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ task: "x" }) })).status === 403);
await post(`/api/chains/${viaHttp.id}/stop`, {});
for (const t of threads.store.threads()) threads.stop(t.id);
server.close();

if (failed) {
  console.error(`${failed} teams check(s) failed`);
  process.exit(1);
}
console.log("Agents working together behave as expected");
process.exit(0);
