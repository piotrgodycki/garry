/**
 * Regression test for Build, in a real browser against a real Garry server
 * whose agents are a stand-in for Claude Code: Your jobs lists every job in
 * one list, the one that needs you first with what it asks, a working one with
 * what it is doing, filters by what each needs, follows the agents without a
 * reload, and a row opens its work; Start a job has labelled fields and
 * explains each way agents can work; the feature pipeline opens from the
 * header, and old links to Live agents land there. Needs the built dashboard
 * and Chromium, like test:dropdown.
 * Run with: pnpm -C garry-tool test:build-ui (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-build-ui-"));
process.env.GARRY_HOME = join(home, ".garry");
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
const project = threads.store.addProject(repo);
const ready = threads.create(project.id, "write the release notes");
await until(() => !threads.isRunning(ready.id));
const asks = threads.create(project.id, "ASK add a buy button");
await until(() => !threads.isRunning(asks.id));
const busy = threads.create(project.id, "BUSY add a checkout page");
await until(() => threads.store.events(busy.id).some((e) => e.type === "tool"));

const server = createGarryServer({ registry: join(home, "registry"), skills: join(home, "none"), routing: join(home, "none.json"), threads, ui }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/build`);
  const now = page.getByRole("region", { name: "Your jobs" });
  await now.getByText("Write NOTES.md").waitFor({ timeout: 10_000 }).catch(() => undefined);
  const rows = await now.getByRole("listitem").allInnerTexts();
  expect("Your jobs lists every job, in one list", rows.length === 3, rows.join(" | "));
  expect("the one that needs you comes first, with what it asks", /ASK add a buy button[\s\S]*Needs your answer[\s\S]*red or blue/.test(rows[0] ?? ""), rows[0]);
  expect("a working agent says what it is doing", rows.some((r) => /BUSY add a checkout page[\s\S]*Working[\s\S]*Write NOTES\.md/.test(r)), rows.join(" | "));
  expect("finished work reads ready to review", rows.some((r) => /write the release notes[\s\S]*Ready to review/.test(r)), rows.join(" | "));
  const filters = now.getByRole("radiogroup", { name: "show" });
  expect("the filters count what is in them", /Needs you\s*1/.test(await filters.getByRole("radio", { name: /Needs you/ }).innerText()) && /Working\s*1/.test(await filters.getByRole("radio", { name: /Working/ }).innerText()));
  await filters.getByRole("radio", { name: /Needs you/ }).click();
  const needing = await now.getByRole("listitem").allInnerTexts();
  expect("a filter shows only its jobs", needing.length === 1 && needing[0].includes("ASK add a buy button"), needing.join(" | "));
  await filters.getByRole("radio", { name: "All" }).click();

  // the agent finishes: the row changes without reloading
  threads.stop(busy.id);
  const changed = await page
    .waitForFunction(() => !document.querySelector('[aria-labelledby="your-jobs"]')?.textContent?.includes("Write NOTES.md"), undefined, { timeout: 8000 })
    .then(() => true, () => false);
  expect("the list follows the agents without a reload", changed);

  await now.getByRole("link", { name: /ASK add a buy button/ }).click();
  await page.waitForURL(`**/build/${asks.id}`);
  expect("a row opens its work", page.url().endsWith(`/build/${asks.id}`));

  // starting a job: labelled fields, the way it runs explained
  await page.goto(`${base}/build`);
  const job = page.getByRole("region", { name: "Start a job" });
  await job.waitFor();
  const how = await job.getByRole("radio").allInnerTexts();
  expect("who works on it: three ways, each explained", how.length === 3 && how.every((h) => h.split("\n").filter(Boolean).length >= 2), how.join(" | "));
  expect("the fields are labelled, not only hinted", (await job.getByRole("textbox", { name: "What should change?" }).count()) === 1);

  // the feature pipeline is a view of Build, and old links land there
  await page.goto(`${base}/build`);
  await page.getByRole("link", { name: "Feature pipeline" }).click();
  await page.getByRole("button", { name: "stop all agents" }).waitFor({ timeout: 8000 }).catch(() => undefined);
  expect("the feature pipeline opens from Build, with a way back", page.url().endsWith("/build?view=pipeline") && (await page.getByRole("button", { name: "stop all agents" }).count()) === 1 && (await page.getByRole("link", { name: "Build" }).filter({ hasText: "Build" }).count()) >= 1);
  await page.goto(`${base}/agent?feature=FEAT-1`);
  await page.waitForURL("**/build?view=pipeline&feature=FEAT-1");
  expect("an old Live agents link opens it, the feature kept", page.url().endsWith("/build?view=pipeline&feature=FEAT-1"));
  expect("the menu has one place for agents", (await page.getByRole("navigation", { name: "main" }).getByRole("link", { name: "Live agents" }).count()) === 0 && (await page.getByRole("navigation", { name: "main" }).getByRole("link", { name: "Build" }).getAttribute("aria-current")) === "page");
  expect("no errors in the page", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.error(`${failed} Build check(s) failed`);
  process.exit(1);
}
console.log("Build behaves as expected");
process.exit(0);
