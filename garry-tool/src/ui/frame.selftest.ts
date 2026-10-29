/**
 * Regression test for the frame on a wide screen, in a real browser against a
 * real Garry server whose agents are a stand-in for Claude Code: the rail has
 * every page with its name beside it on hover, the one you are on marked, and
 * the work that needs you as a badge on Live; the top bar's counts are
 * /api/status; Garry's field floats at the foot of every page: ⌘K focuses
 * it, a page's name goes there, Enter puts a sentence in line for Garry (send
 * more and they wait their turn, without touching the work that runs, and
 * one that waits can be dropped), or the arrows pick separate work in Build.
 * On a phone the old top bar stays, the rail goes and the field stays.
 * Needs the built dashboard and Chromium, like test:dropdown.
 * Run with: pnpm -C garry-tool test:frame (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-frame-"));
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

// two agents ask, one works, three have something ready: each count its own
const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const project = threads.store.addProject(repo);
for (const task of ["write the release notes", "fix the footer", "tidy the readme", "ASK add a buy button", "ASK add a wish list"]) {
  const t = threads.create(project.id, task);
  await until(() => !threads.isRunning(t.id));
}
const busy = threads.create(project.id, "BUSY add a checkout page");
await until(() => threads.store.events(busy.id).some((e) => e.type === "tool"));

const server = createGarryServer({ registry: join(home, "registry"), skills: join(home, "none"), routing: join(home, "none.json"), threads, ui }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const status = (await (await fetch(`${base}/api/status`)).json()) as { counts: { needsYou: number; working: number; done: number } };
expect("the server sees two that need you, one working, three ready", status.counts.needsYou === 2 && status.counts.working === 1 && status.counts.done === 3, JSON.stringify(status.counts));

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/stacks`);
  const rail = page.getByRole("complementary", { name: "Garry" });
  const nav = rail.getByRole("navigation", { name: "main" });
  await nav.waitFor();

  // the rail: every page, the one you are on marked
  const names = await nav.getByRole("link").evaluateAll((ls) => ls.map((l) => l.getAttribute("data-tip")));
  expect("the rail has every page", ["Dashboard", "Live", "Build", "Pull requests", "Services", "Architecture", "Stacks", "Files", "Skills", "Model routing", "Settings"].every((n) => names.includes(n)), names.join(", "));
  expect("Files sits with the work, right after Build", names.indexOf("Files") === names.indexOf("Build") + 1, names.join(", "));
  const current = await nav.locator('[aria-current="page"]').evaluateAll((ls) => ls.map((l) => l.getAttribute("data-tip")));
  expect("the page you are on is marked, and only it", current.length === 1 && current[0] === "Stacks", current.join(", "));

  // the badge on Live is what needs you
  const liveLink = nav.getByRole("link", { name: "Live, 2 need you" });
  await liveLink.waitFor({ timeout: 8000 }).catch(() => undefined);
  expect("Live carries a badge with the work that needs you", (await liveLink.count()) === 1 && (await liveLink.locator(".railBadge").innerText()) === "2", String(await nav.getByRole("link").nth(1).getAttribute("aria-label").catch(() => "")));

  // the name beside the rail on hover, at the icon's height, not clipped
  const archi = nav.getByRole("link", { name: "Architecture" });
  await archi.hover();
  const tip = rail.locator(".railFloat");
  await tip.waitFor({ timeout: 2000 }).catch(() => undefined);
  const [tb, ab, rb] = [await tip.boundingBox(), await archi.boundingBox(), await rail.boundingBox()];
  expect("hovering an icon shows its name beside the rail, level with it", !!tb && !!ab && !!rb && (await tip.innerText()) === "Architecture" && tb.x >= rb.x + rb.width - 1 && Math.abs(tb.y + tb.height / 2 - (ab.y + ab.height / 2)) <= 3, JSON.stringify({ tb, ab }));
  await page.mouse.move(800, 500);
  await page.waitForTimeout(100);
  expect("and it goes when the pointer leaves", (await tip.count()) === 0);

  // the top bar: the project and page, and the counts from /api/status
  const top = page.getByRole("banner").filter({ has: page.getByRole("navigation", { name: "Garry at a glance" }) });
  expect("the top bar names the page", (await top.locator(".crumbPage").innerText()) === "Stacks");
  const gauges = top.getByRole("navigation", { name: "Garry at a glance" });
  const labels = await gauges.getByRole("link").evaluateAll((ls) => ls.map((l) => l.getAttribute("aria-label")));
  expect("the top bar counts match /api/status", labels.join("|") === `${status.counts.needsYou} need you|${status.counts.working} working|${status.counts.done} ready`, labels.join("|"));
  await gauges.getByRole("link", { name: "2 need you" }).click();
  await page.waitForURL("**/live");
  expect("a count opens Live", new URL(page.url()).pathname === "/live");

  // ⌘K, then a page's name
  await page.goto(`${base}/`);
  await nav.waitFor();
  const line = page.getByRole("combobox", { name: "tell Garry" });
  await page.keyboard.press("ControlOrMeta+k");
  expect("⌘K focuses Garry's field", await line.evaluate((el) => el === document.activeElement));
  expect("with nothing typed it lists the pages", (await page.getByRole("listbox", { name: "commands" }).getByRole("option").count()) >= 10);
  await page.keyboard.type("stacks");
  const first = page.getByRole("option").first();
  expect("a page's name puts that page first", (await first.innerText()).includes("Go to Stacks") && (await first.getAttribute("aria-selected")) === "true", await first.innerText());
  await page.keyboard.press("Enter");
  await page.waitForURL("**/stacks");
  expect("Enter goes there and empties the field", new URL(page.url()).pathname === "/stacks" && (await line.inputValue()) === "");

  // the arrows pick separate work in Build, written in
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("add a newsletter sign up form");
  expect("a sentence is for Garry first", (await page.getByRole("option").first().innerText()).includes("Tell Garry: add a newsletter sign up form"));
  await page.keyboard.press("ArrowDown");
  expect("the arrows move the pick", (await page.getByRole("option", { selected: true }).innerText()).includes("Start separate work"));
  await page.keyboard.press("Enter");
  await page.waitForURL("**/build?task=*");
  const box = page.locator("textarea").first();
  await box.waitFor();
  expect("that opens Build with it written in", (await box.inputValue()) === "add a newsletter sign up form", await box.inputValue());

  // Enter tells Garry; more messages wait their turn
  type Q = { items: { id: string; text: string; status: string; threadId?: string }[] };
  const queue = async () => (await (await fetch(`${base}/api/garry/queue`)).json()) as Q;
  for (const said of ["BUSY tidy the cart", "then rename the buttons", "then write the notes"]) {
    await line.click();
    await line.fill(said);
    await page.keyboard.press("Enter");
    await page.waitForFunction((t) => !(document.querySelector('[aria-label="tell Garry"]') as HTMLInputElement).value && t, said);
  }
  const q = await queue();
  const mine = (t: string) => q.items.find((i) => i.text === t);
  expect("Enter puts each message in line: the first runs, the rest wait", mine("BUSY tidy the cart")?.status === "running" && mine("then rename the buttons")?.status === "queued" && mine("then write the notes")?.status === "queued", JSON.stringify(q.items.map((i) => [i.text, i.status])));
  await line.blur();
  const shown = page.getByRole("list", { name: "what you told Garry" });
  await shown.getByText("then write the notes").waitFor({ timeout: 5000 }).catch(() => undefined);
  const rows = await shown.locator("li[data-status]").evaluateAll((ls) => ls.map((l) => `${l.getAttribute("data-status")}: ${(l as HTMLElement).innerText.replace(/\s+/g, " ").trim()}`));
  expect("above the field: what runs, and what waits with its place in line", rows.some((r) => r.startsWith("running: BUSY tidy the cart Garry is on it")) && rows.some((r) => r.startsWith("queued: then rename the buttons waiting, 1 in line")) && rows.some((r) => r.startsWith("queued: then write the notes waiting, 2 in line")), rows.join(" | "));
  const running = mine("BUSY tidy the cart")!;
  const thread = (await (await fetch(`${base}/api/threads/${running.threadId}`)).json()) as { events: { type: string }[] };
  expect("the waiting ones do not touch the work that runs", thread.events.filter((e) => e.type === "user").length === 1);
  await shown.getByRole("button", { name: "drop: then write the notes" }).click();
  await page.waitForTimeout(400);
  expect("a waiting message can be dropped", (await queue()).items.find((i) => i.text === "then write the notes")?.status === "cancelled" && (await shown.getByText("then write the notes").count()) === 0);

  // Escape leaves the field
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("x");
  await page.keyboard.press("Escape");
  expect("Escape leaves the field and closes the list", (await line.evaluate((el) => el !== document.activeElement)) && (await page.getByRole("listbox", { name: "commands" }).count()) === 0);

  // the rail's talk button: to the field, dictating where the browser can
  await rail.getByRole("button", { name: "talk to Garry" }).click();
  expect("the rail's talk button goes to Garry's field", await line.evaluate((el) => el === document.activeElement));
  expect("there is no separate voice dock any more", (await page.getByRole("dialog", { name: "Talk to Garry" }).count()) === 0);

  // the field floats at the foot, centred on the page
  const fb = (await page.locator(".garryField").boundingBox())!;
  const vw = page.viewportSize()!;
  expect("the field floats at the foot, centred beside the rail", Math.abs(fb.x + fb.width / 2 - (64 + (vw.width - 64) / 2)) <= 2 && vw.height - (fb.y + fb.height) >= 8 && vw.height - (fb.y + fb.height) <= 24, JSON.stringify(fb));

  // on a phone: no rail, no top bar; the field stays
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/`);
  await page.waitForTimeout(300);
  const hidden = await page.evaluate(() => [".rail", ".topbar"].map((s) => getComputedStyle(document.querySelector(s)!).display));
  const pf = (await page.locator(".garryField").boundingBox())!;
  expect("on a phone the frame steps aside for the menu, the field stays", hidden.every((d) => d === "none") && pf.x >= 0 && pf.x + pf.width <= 390, `${hidden.join(",")} ${JSON.stringify(pf)}`);
  expect("no errors in the page", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
  for (const t of threads.store.threads()) threads.stop(t.id);
  server.close();
}

if (failed) {
  console.error(`${failed} frame check(s) failed`);
  process.exit(1);
}
console.log("The frame behaves as expected");
process.exit(0);
