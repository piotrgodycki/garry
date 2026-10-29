/**
 * Regression test for agents working together, in a real browser against a
 * real Garry server whose agents are a stand-in for Claude Code: in Build you
 * pick a reviewer or a chain; a pair shows its writer, its reviewer and the
 * round until it is approved; a chain's steps are written and ordered before
 * it starts, and while they wait they move, drop and get added to; on a piece
 * of work, "Then another agent" hands it on; Live shows the reviewer as one.
 * Needs the built dashboard and Chromium, like test:dropdown.
 * Run with: pnpm -C garry-tool test:teams-ui (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-teams-ui-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../threads/testdata/fake-claude.mjs", import.meta.url));
const ui = fileURLToPath(new URL("../../../garry-ui/dist", import.meta.url));
if (!existsSync(join(ui, "index.html"))) {
  console.error(`the dashboard is not built (${ui}); run pnpm -C garry-ui build first`);
  process.exit(1);
}

const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { launchChromium } = await import("../shots/browser.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};

const repo = join(home, "shop");
execFileSync("git", ["init", "-q", repo]);
writeFileSync(join(repo, "README.md"), "# shop\n");
execFileSync("git", ["-C", repo, "add", "-A"]);
execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
threads.store.addProject(repo, "Shop");
const server = createGarryServer({ registry: join(home, "registry"), skills: join(home, "none"), routing: join(home, "none.json"), threads, ui }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
type Teams = { pairs: { task: string; status: string; writer: string; reviewer?: string; round: number; maxRounds: number }[]; chains: { name: string; status: string; steps: { prompt: string; status: string; threadId?: string }[] }[] };
const teams = async () => (await (await fetch(`${base}/api/teams`)).json()) as Teams;

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/build`);
  const modes = page.getByRole("radiogroup", { name: "who works on it" });
  await modes.waitFor();

  // a pair, from Build
  await modes.getByRole("radio", { name: /^Agent and reviewer/ }).click();
  await page.getByRole("combobox", { name: "review rounds" }).selectOption("2");
  await page.getByRole("textbox", { name: "What should change?" }).fill("PAIR2 add a buy button");
  await page.getByRole("button", { name: "Start the job" }).click();
  await page.waitForURL(/\/build\/[a-z0-9]+$/);
  let t = await teams();
  expect("With a reviewer starts a pair, two rounds, and opens the writer", t.pairs.length === 1 && page.url().endsWith(`/build/${t.pairs[0].writer}`) && t.pairs[0].task === "PAIR2 add a buy button" && t.pairs[0].maxRounds === 2);
  await page.goto(`${base}/build`);
  const pairCard = page.getByRole("article", { name: "agent and reviewer: PAIR2 add a buy button" });
  await pairCard.getByText("Approved, ready to review", { exact: true }).waitFor({ timeout: 20_000 }).catch(() => undefined);
  t = await teams();
  expect("Your jobs shows the pair until the reviewer approves, with its writer and reviewer", (await pairCard.getByText("Approved, ready to review", { exact: true }).count()) === 1 && (await pairCard.getByRole("link", { name: "Agent", exact: true }).count()) === 1 && (await pairCard.getByRole("link", { name: "Reviewer" }).getAttribute("href")) === `/build/${t.pairs[0].reviewer}`, await pairCard.innerText().catch(() => ""));
  expect("and what the reviewer said last", (await pairCard.innerText()).includes("APPROVED"));
  const jobs = page.getByRole("region", { name: "Your jobs" });
  const loose = await jobs.locator(`li > a[href="/build/${t.pairs[0].writer}"], li > a[href="/build/${t.pairs[0].reviewer}"]`).count();
  expect("the pair's two agents show inside it, not again as jobs of their own", loose === 0, String(loose));

  // a chain, from Build: steps written and put in order before it starts
  await modes.getByRole("radio", { name: /^Several steps/ }).click();
  await page.getByRole("textbox", { name: "Step 1: what should change first?" }).fill("BUSY write the spec");
  await page.getByRole("textbox", { name: "step 2" }).fill("write the notes");
  await page.getByRole("button", { name: "Add a step" }).first().click();
  await page.getByRole("textbox", { name: "step 3" }).fill("build it");
  await page.getByRole("button", { name: "move step 3 up" }).click();
  await page.getByRole("button", { name: "Add a step" }).first().click();
  await page.getByRole("textbox", { name: "step 4" }).fill("write the tests");
  await page.getByRole("button", { name: "Start the job" }).click();
  await page.waitForFunction(async () => true);
  await new Promise((r) => setTimeout(r, 800));
  t = await teams();
  const chain = t.chains[0];
  expect("A chain starts with its steps in the order you set", chain?.steps.map((s) => s.prompt).join(" > ") === "BUSY write the spec > build it > write the notes > write the tests" && chain.steps[0].status === "running", JSON.stringify(chain?.steps));

  // while they wait: move, drop, add
  const chainCard = page.getByRole("article", { name: /^job in steps: / });
  await chainCard.getByRole("button", { name: "move down: build it" }).waitFor({ timeout: 8000 });
  await chainCard.getByRole("button", { name: "move down: build it" }).click();
  await page.waitForTimeout(500);
  await chainCard.getByRole("button", { name: "drop: write the tests" }).click();
  await page.waitForTimeout(500);
  await chainCard.getByRole("textbox", { name: /^add a step to/ }).fill("update the changelog");
  await chainCard.getByRole("button", { name: "Add a step" }).click();
  await page.waitForTimeout(600);
  t = await teams();
  expect("waiting steps move, drop and get added to from Build", t.chains[0].steps.filter((s) => s.status !== "dropped").map((s) => s.prompt).join(" > ") === "BUSY write the spec > write the notes > build it > update the changelog", t.chains[0].steps.map((s) => `${s.prompt}:${s.status}`).join(" > "));
  const shown = await chainCard.locator("li[data-status]").evaluateAll((ls) => ls.map((l) => l.getAttribute("data-status")));
  expect("each step shows its state", shown.join() === "running,waiting,waiting,waiting", shown.join());
  await chainCard.getByRole("button", { name: "Stop after this step" }).click();
  await page.waitForTimeout(500);
  t = await teams();
  expect("the chain can be stopped: nothing more starts", t.chains[0].status === "stopped" && t.chains[0].steps.slice(1).every((s) => s.status === "dropped"));
  threads.stop(t.chains[0].steps[0].threadId!);

  // a piece of work handed on to another agent
  await page.goto(`${base}/build/${t.pairs[0].writer}`);
  const next = page.getByRole("region", { name: "then another agent" });
  await next.getByRole("textbox", { name: "what the next agent does" }).fill("write the tests for the button");
  await next.getByRole("button", { name: "Hand it on" }).click();
  await next.getByText(/it starts here once this work is done/).waitFor({ timeout: 5000 }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 1500));
  t = await teams();
  const handed = t.chains.find((c) => c.steps[0].threadId === t.pairs[0].writer);
  expect("Then another agent hands the work on: a chain after it, in its working copy", !!handed && handed.steps[1]?.prompt === "write the tests for the button" && ["running", "done"].includes(handed.steps[1].status), JSON.stringify(handed));

  // Live: the reviewer is a reviewer
  await page.goto(`${base}/live`);
  const lanes = page.getByRole("listbox", { name: "agents" });
  await lanes.getByRole("option").first().waitFor();
  const reviewerLane = lanes.getByRole("option", { name: /^Review: PAIR2 add a buy button/ });
  expect("Live shows the reviewer with the reviewer's icon", (await reviewerLane.locator('[data-crew="reviewer"]').count()) === 1);
  expect("no errors in the page", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
  for (const t of threads.store.threads()) threads.stop(t.id);
  server.close();
}

if (failed) {
  console.error(`${failed} teams UI check(s) failed`);
  process.exit(1);
}
console.log("Agents working together behave as expected in the dashboard");
process.exit(0);
