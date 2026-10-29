/**
 * Regression test for the Live screen, in a real browser against a real Garry
 * server whose agents are a stand-in for Claude Code: what needs you is listed
 * with the agent's own words and answered in place (the agent then works on
 * your answer); a stopped agent can be told to fix it; every agent is a lane
 * on the timeline in the state the server gives it, segments where its events
 * put them; picking a lane (click, arrows, J and K) shows what it did and what
 * it cost; the rail's badge and the top bar's counts lead here.
 * Needs the built dashboard and Chromium, like test:dropdown.
 * Run with: pnpm -C garry-tool test:live-ui (CI runs it too).
 * GARRY_LIVE_SHOTS=<dir> also saves screenshots there.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-live-ui-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../threads/testdata/fake-claude.mjs", import.meta.url));
const ui = fileURLToPath(new URL("../../../garry-ui/dist", import.meta.url));
if (!existsSync(join(ui, "index.html"))) {
  console.error(`the dashboard is not built (${ui}); run pnpm -C garry-ui build first`);
  process.exit(1);
}
const shots = process.env.GARRY_LIVE_SHOTS;

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
const until = async (f: () => boolean, ms = 10_000) => {
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
const project = threads.store.addProject(repo, "Shop");
const run = async (task: string) => {
  const t = threads.create(project.id, task);
  await until(() => !threads.isRunning(t.id));
  return t.id;
};
const ready = await run("Write the release notes");
const asks = await run("ASK Add a buy button");
const broke = await run("FAIL Fix the search prices");
const busy = threads.create(project.id, "BUSY Add a checkout page");
await until(() => threads.store.events(busy.id).some((e) => e.type === "tool"));

// one lane with known times: it worked from 40 to 25 minutes ago and has waited on you since
const minAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const sale = threads.store.save({ id: threads.store.newId(), projectId: project.id, title: "Plan the summer sale", status: "idle", branch: "garry/sale", worktree: repo, baseSha: "0", sessionId: null, createdAt: minAgo(40), updatedAt: minAgo(25) });
threads.store.append(sale.id, { type: "user", text: "Plan the summer sale", at: minAgo(40) });
threads.store.append(sale.id, { type: "text", text: "Here is a plan.\nShould it start on Monday?", at: minAgo(25) });
threads.store.append(sale.id, { type: "turn_end", ok: true, costUsd: 0.12, at: minAgo(25) });

const server = createGarryServer({ registry: join(home, "registry"), skills: join(home, "none"), routing: join(home, "none.json"), threads, ui }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const browser = await launchChromium();
try {
  for (const scheme of ["light", "dark"] as const) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${base}/`);
    if (scheme === "light") {
      // the rail's badge and the top bar's count both lead here
      const badge = page.getByRole("navigation", { name: "main" }).getByRole("link", { name: "Live, 3 need you" });
      await badge.waitFor({ timeout: 8000 }).catch(() => undefined);
      expect("the rail's Live carries what needs you", (await badge.count()) === 1);
      await page.getByRole("navigation", { name: "Garry at a glance" }).getByRole("link", { name: "3 need you" }).click();
      await page.waitForURL("**/live");
      expect("the top bar's need you opens Live", new URL(page.url()).pathname === "/live");
    } else await page.goto(`${base}/live`);

    const needs = page.getByRole("region", { name: /Needs you/ });
    const lanes = page.getByRole("listbox", { name: "agents" });
    await lanes.getByRole("option").first().waitFor();
    if (shots) await page.screenshot({ path: join(shots, `live-${scheme}.png`), fullPage: true });
    if (scheme === "dark") {
      expect("no errors in the dark", errors.length === 0, errors.join("; "));
      await page.close();
      continue;
    }

    // what needs you: the question in the agent's words, and the stop
    const question = needs.getByRole("article", { name: /Add a buy button: asks a question/ });
    const stopped = needs.getByRole("article", { name: /Fix the search prices: stopped before finishing/ });
    expect("needs you shows the question in the agent's own words", (await question.count()) === 1 && (await question.innerText()).includes("Should it be red or blue?"), await needs.innerText());
    expect("and the agent that stopped", (await stopped.count()) === 1 && (await stopped.getByRole("button", { name: "Let it fix" }).count()) === 1);
    expect("its count is three", (await needs.getByRole("heading").innerText()).includes("3"));

    // every agent is a lane, in the server's state, what needs you first
    const options = await lanes.getByRole("option").evaluateAll((os) => os.map((o) => o.getAttribute("aria-label")));
    const waits = /, (Needs you|Failed)$/;
    expect("every agent is a lane in its state, what needs you first", options.length === 5 && options.slice(0, 3).every((o) => waits.test(o!)) && options[3] === "BUSY Add a checkout page, Working" && options[4] === "Write the release notes, Ready", options.join(" | "));
    const saleLane = lanes.getByRole("option", { name: /Plan the summer sale/ });
    const segs = await saleLane.locator("[title][data-state]").evaluateAll((s) => s.map((x) => x.getAttribute("data-state")));
    expect("a lane is work, then the question that waits", segs.join(",") === "work,wait", segs.join(","));
    // the 1 hour span runs from 56.4 minutes ago to 3.6 minutes ahead
    const track = (await saleLane.locator("[title]").first().evaluateHandle((el) => el.parentElement!)).asElement()!;
    const tb = (await track.boundingBox())!;
    const x = (minutes: number) => tb.x + (tb.width * (56.4 - minutes)) / 60;
    const [work, wait] = [(await saleLane.locator('[title][data-state="work"]').boundingBox())!, (await saleLane.locator('[title][data-state="wait"]').boundingBox())!];
    const nowX = (await lanes.locator(":scope > [aria-hidden]").last().boundingBox())!.x;
    expect("work sits where its events put it", Math.abs(work.x - x(40)) <= 3 && Math.abs(work.x + work.width - x(25)) <= 3, JSON.stringify({ work, from: x(40), to: x(25) }));
    expect("the question runs from there up to the now line", Math.abs(wait.x - x(25)) <= 3 && Math.abs(wait.x + wait.width - x(0)) <= 3 && Math.abs(nowX - x(0)) <= 3, JSON.stringify({ wait, nowX, now: x(0) }));
    expect("a segment says what it was when you point at it", (await saleLane.locator('[title][data-state="wait"]').getAttribute("title"))!.startsWith("Needs you: Should it start on Monday?"));

    // picking a lane: what it did and what it cost
    const agent = page.getByRole("region", { name: /^agent: / });
    expect("the first lane is followed below", (await agent.getAttribute("aria-label"))!.startsWith("agent: ") && (await lanes.getByRole("option", { selected: true }).count()) === 1);
    await lanes.getByRole("option", { name: /Write the release notes/ }).click();
    await page.getByRole("region", { name: "agent: Write the release notes" }).waitFor();
    const log = page.getByRole("list", { name: "what it did" });
    await log.getByText("Write the release notes").first().waitFor({ timeout: 5000 }).catch(() => undefined);
    const rows = await log.locator("li").evaluateAll((ls) => ls.map((l) => [...l.children].slice(1).map((c) => c.textContent).join(" | ")));
    expect("clicking a lane shows what it did: your message, its tool, its words, the end", rows.join("\n") === "You | Write the release notes\nWrite | NOTES.md\nSays | wrote NOTES.md\nDone | this turn cost $0.01", rows.join("\n"));
    expect("and what it cost", (await page.getByRole("region", { name: "agent: Write the release notes" }).locator("dl").innerText()).includes("$0.01"));
    await page.keyboard.press("k");
    expect("K moves up a lane", (await lanes.getByRole("option", { selected: true }).getAttribute("aria-label")) === "BUSY Add a checkout page, Working");
    await page.keyboard.press("j");
    expect("J moves down again", (await lanes.getByRole("option", { selected: true }).getAttribute("aria-label")) === "Write the release notes, Ready");
    await lanes.focus();
    await page.keyboard.press("ArrowUp");
    expect("so do the arrows", (await lanes.getByRole("option", { selected: true }).getAttribute("aria-label")) === "BUSY Add a checkout page, Working");
    const working = page.getByRole("region", { name: "agent: BUSY Add a checkout page" });
    expect("a working agent says what it does and can be stopped", (await working.innerText()).includes("Write NOTES.md") && (await working.getByRole("button", { name: "Stop" }).count()) === 1);

    // answering in place: the agent works on your answer, and it leaves needs you
    await question.getByRole("textbox", { name: "answer ASK Add a buy button" }).fill("Blue, like the other actions");
    await question.getByRole("button", { name: "Send" }).click();
    await until(() => threads.store.events(asks).some((e) => e.type === "user" && e.text === "Blue, like the other actions"), 5000);
    expect("an answer reaches the agent as your next message", threads.store.events(asks).some((e) => e.type === "user" && e.text === "Blue, like the other actions"));
    await until(() => !threads.isRunning(asks));
    await question.waitFor({ state: "detached", timeout: 8000 }).catch(() => undefined);
    expect("and the question leaves needs you", (await question.count()) === 0);

    // a stop: Let it fix sends it back to work
    await stopped.getByRole("button", { name: "Let it fix" }).click();
    await until(() => threads.store.events(broke).filter((e) => e.type === "user").length === 2, 5000);
    expect("Let it fix sends the agent back to work on what went wrong", /fix it/.test((threads.store.events(broke).filter((e) => e.type === "user")[1] as { text: string } | undefined)?.text ?? ""));

    // the time span
    await page.getByRole("button", { name: "15 min" }).click();
    expect("the time span can be changed", (await page.getByRole("button", { name: "15 min" }).getAttribute("aria-pressed")) === "true");
    expect("no errors in the page", errors.length === 0, errors.join("; "));
    await page.close();
  }

  // on a phone: one column, nothing wider than the screen
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${base}/live`);
  await phone.getByRole("listbox", { name: "agents" }).getByRole("option").first().waitFor();
  if (shots) await phone.screenshot({ path: join(shots, "live-phone.png"), fullPage: true });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth);
  expect("on a phone nothing is wider than the screen", wide <= 390, String(wide));
  await phone.close();
} finally {
  await browser.close();
  threads.stop(busy.id);
  server.close();
}

if (failed) {
  console.error(`${failed} Live screen check(s) failed`);
  process.exit(1);
}
console.log("The Live screen behaves as expected");
process.exit(0);
