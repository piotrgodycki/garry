/**
 * Regression test for Live: an agent's lane worked out from its event log
 * (work from your message to the turn's end, then what it left you with: a
 * question, a stop, or work to review; shipping ends the lane), the view over
 * every thread (what shows, in what order, what needs you, today's spend),
 * that it agrees with Garry at a glance, and GET /api/live.
 * Run with: pnpm -C garry-tool test:live (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-live-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";

const { laneOf, liveView } = await import("./live.js");
const { garryStatus } = await import("./status.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");
type Thread = import("../threads/store.js").Thread;
type ThreadEvent = import("../threads/store.js").ThreadEvent;

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};

const day = new Date();
day.setHours(12, 0, 0, 0);
const at = (min: number) => new Date(day.getTime() + min * 60_000).toISOString();
const thread = (over: Partial<Thread> = {}): Thread => ({ id: "t1", projectId: "p1", title: "Add a buy button", status: "idle", branch: "garry/buy", worktree: "/x", baseSha: "0", sessionId: null, createdAt: at(0), updatedAt: at(30), ...over });
const turn = (from: number, to: number, said: string, ok = true, cost = 0.02): ThreadEvent[] => [
  { type: "user", text: `do it ${from}\nmore detail`, at: at(from) },
  { type: "tool", id: "a", name: "Edit", summary: "src/Buy.tsx", at: at(from + 1) },
  { type: "tool_result", id: "a", ok, preview: ok ? "done" : "expected 12 prices, saw 0\nat search.test.ts", at: at(from + 2) },
  { type: "text", text: said, at: at(to) },
  { type: "turn_end", ok, costUsd: cost, at: at(to) },
];
const brief = (l: ReturnType<typeof laneOf>) => l.segments.map((s) => `${s.state}:${s.from === null ? "" : (new Date(s.from).getTime() - day.getTime()) / 60_000}-${s.to === null ? "now" : (new Date(s.to).getTime() - day.getTime()) / 60_000}`).join(" ");

// one turn that ends in a question: work, then needs you until you answer
let lane = laneOf(thread(), "Shop", turn(0, 10, "I added it.\nShould it be red or blue?"), false);
expect("a turn is work from your message to its end, then a question that waits", brief(lane) === "work:0-10 wait:10-now" && lane.state === "wait", brief(lane));
expect("work is labelled with the first line of your message", lane.segments[0].label === "do it 0");
expect("the question is the agent's own last line", lane.segments[1].label === "Should it be red or blue?");
expect("it counts turns, tools and cost", lane.turns === 1 && lane.tools === 1 && Math.abs(lane.costUsd - 0.02) < 1e-9 && lane.project === "Shop");

// answering: the wait ends at your answer, and a turn that ends well is ready
lane = laneOf(thread(), "Shop", [...turn(0, 10, "Red or blue?"), ...turn(25, 40, "Done, it is blue.")], false);
expect("your answer ends the wait and starts work; then it is ready", brief(lane) === "work:0-10 wait:10-25 work:25-40 done:40-now" && lane.state === "done", brief(lane));

// a turn that fails: the problem is what the failing tool said
lane = laneOf(thread(), "Shop", turn(0, 5, "It broke.", false), false);
expect("a failed turn is failed, with the first line of what went wrong", lane.state === "fail" && lane.segments[1].label === "expected 12 prices, saw 0", lane.segments[1]?.label);

// working now: the open stretch, and the tool it uses
const working: ThreadEvent[] = [...turn(0, 10, "Ready?"), { type: "user", text: "yes", at: at(20) }, { type: "tool", id: "b", name: "Bash", summary: "pnpm test", at: at(21) }];
lane = laneOf(thread(), "Shop", working, true);
expect("a running turn is open work, saying what it does", brief(lane) === "work:0-10 wait:10-20 work:20-now" && lane.state === "work" && lane.doing === "Bash pnpm test", `${brief(lane)} ${lane.doing}`);

// cut off: not running, yet the turn never ended
lane = laneOf(thread({ updatedAt: at(26) }), "Shop", working, false);
expect("a turn cut off is closed where the thread stopped, then failed", brief(lane) === "work:0-10 wait:10-20 work:20-26 fail:26-now" && lane.doing === null, brief(lane));
const cut = new ThreadStore(join(home, "cut"));
const ct = cut.save(thread({ id: "cutoff1" }));
// the turn before ended well, so only the cut off one can make it need you
for (const e of [...turn(0, 10, "Done."), ...working.slice(5)]) cut.append(ct.id, e);
expect("Garry at a glance agrees: a cut off agent needs you", garryStatus(new ThreadManager(cut)).items[0]?.state === "needs-you");

// shipped: committing ends the lane
lane = laneOf(thread({ commit: "abc" }), "Shop", [...turn(0, 10, "Done."), { type: "git", action: "commit", detail: "abc", at: at(15) }], false);
expect("committing ends the lane", brief(lane) === "work:0-10 done:10-15" && lane.state === null, brief(lane));

lane = laneOf(thread({ pr: { number: 7, url: "u" } }), "Shop", turn(0, 10, "Done."), false);
expect("a thread with a pull request is shipped, even without its git event", lane.state === null && lane.segments.every((s) => s.to !== null));

// a thread in error after a turn that looked fine
lane = laneOf(thread({ status: "error" }), "Shop", turn(0, 10, "Done."), false);
expect("a thread in error is failed, not ready", lane.state === "fail");

// the view over a store: what shows, in what order, what needs you, spend
const store = new ThreadStore(process.env.GARRY_HOME!);
const repo = join(home, "shop");
execFileSync("git", ["init", "-q", repo]);
const project = store.addProject(repo, "Shop");
const add = (title: string, events: ThreadEvent[], over: Partial<Thread> = {}) => {
  const t = store.save(thread({ id: store.newId(), projectId: project.id, title, ...over }));
  for (const e of events) store.append(t.id, e);
  return t.id;
};
const asksOld = add("Asks first", turn(0, 10, "Red or blue?"));
const asksNew = add("Asks later", turn(5, 20, "Which font?", true, 0.5));
const stopped = add("Stopped", turn(0, 15, "Broke.", false));
const ready = add("Ready", turn(0, 8, "Done."));
const shipped = add("Shipped", turn(0, 8, "Done."), { commit: "abc" });
const yesterday = add("Yesterday's", [...turn(-24 * 60, -24 * 60 + 5, "Old question?", true, 1)]);
const threads = new ThreadManager(store);
const view = liveView(threads, new Set(store.threads().map((t) => t.id)), new Date(Date.now() - 3600_000));
const ids = view.lanes.map((l) => l.threadId);
expect("every lane touched in the window shows", ids.length === 6 && [asksOld, asksNew, stopped, ready, shipped, yesterday].every((i) => ids.includes(i)), ids.join(","));
expect("what needs you comes first", view.lanes.slice(0, 4).every((l) => l.state === "wait" || l.state === "fail") && view.lanes.slice(0, 4).map((l) => l.threadId).includes(yesterday), view.lanes.map((l) => `${l.title}:${l.state}`).join(", "));
expect("a question still waiting shows however old", ids.includes(yesterday));
expect("shipped lanes come last", ids[ids.length - 1] === shipped);
expect("needs you lists the questions and stops, oldest first", view.needsYou.map((a) => a.threadId).join(",") === [yesterday, asksOld, stopped, asksNew].join(",") && view.needsYou[0].kind === "question" && view.needsYou.find((a) => a.threadId === stopped)?.kind === "stopped", view.needsYou.map((a) => a.title).join(", "));
expect("each ask carries the agent's own words", view.needsYou.find((a) => a.threadId === asksNew)?.text === "Which font?");
expect("today's spend counts only today's turns", Math.abs(view.spentToday - (0.02 * 4 + 0.5)) < 1e-9, String(view.spentToday));
const glance = garryStatus(threads);
expect("it agrees with Garry at a glance on what needs you", glance.counts.needsYou === view.needsYou.length, `${glance.counts.needsYou} vs ${view.needsYou.length}`);

// a narrow window drops finished lanes older than it; waiting ones stay
const narrow = liveView(threads, new Set(store.threads().map((t) => t.id)), new Date(Date.now() + 3600_000));
expect("a window that ended before them drops ready and shipped lanes, keeps the waiting", !narrow.lanes.some((l) => l.threadId === ready || l.threadId === shipped) && narrow.needsYou.length === 4, narrow.lanes.map((l) => l.title).join(", "));

// over HTTP
const server = createGarryServer({ registry: join(home, "reg"), skills: join(home, "none"), routing: join(home, "none.json"), threads }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const api = (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/live`).then((r) => r.json())) as ReturnType<typeof liveView>;
expect("GET /api/live gives the same lanes", api.lanes.map((l) => l.threadId).join(",") === ids.join(",") && api.needsYou.length === 4 && typeof api.now === "string");
server.close();

if (failed) {
  console.error(`${failed} Live check(s) failed`);
  process.exit(1);
}
console.log("Live behaves as expected");
process.exit(0);
