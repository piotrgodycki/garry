/**
 * Regression test for the iPhone app in its new look, through its web build
 * (the same React Native code) in a phone-sized browser, paired with a real
 * Garry server like a phone is: what needs you comes first in the agent's own
 * words and is answered right there (the agent then works on the answer); a
 * stopped agent can be told to fix it; once nothing waits, Garry rests; the
 * agents show with their crew faces in their state; the features follow. Both
 * themes use the shared palette, and the old signal red is gone.
 * Needs the app's web export (pnpm -C garry-mobile export:web) and Chromium.
 * Run with: pnpm -C garry-tool test:mobile (CI runs it too).
 * GARRY_MOBILE_SHOTS=<dir> also saves screenshots there.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-mobile-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../threads/testdata/fake-claude.mjs", import.meta.url));
const app = fileURLToPath(new URL("../../../garry-mobile/dist", import.meta.url));
if (!existsSync(join(app, "index.html"))) {
  console.error(`the app's web build is missing (${app}); run pnpm -C garry-mobile export:web first`);
  process.exit(1);
}
const shots = process.env.GARRY_MOBILE_SHOTS;

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

// the app, served the way a static host would: files, and index.html for every route
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".ttf": "font/ttf" };
const appServer = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(app, path);
  const hit = file.startsWith(app) && existsSync(file) && !file.endsWith("/") && extname(file) ? file : join(app, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(hit)] ?? "application/octet-stream" });
  res.end(readFileSync(hit));
});
await new Promise<void>((r) => appServer.listen(0, "127.0.0.1", r));
const appUrl = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
process.env.GARRY_UI_ORIGINS = appUrl;

// a project where one agent asks, one stopped, one works and one is ready
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
await run("Write the release notes");
const asks = await run("ASK Add a buy button");
const broke = await run("FAIL Fix the search prices");
const busy = threads.create(project.id, "BUSY Add a checkout page");
await until(() => threads.store.events(busy.id).some((e) => e.type === "tool"));

const registry = join(home, "registry");
cpSync(fileURLToPath(new URL("../../testdata/registry/frontend", import.meta.url)), registry, { recursive: true });
const devices = new DeviceStore(join(home, "devices.json"));
const server = createGarryServer({ registry, skills: fileURLToPath(new URL("../../skills", import.meta.url)), routing: join(home, "none.json"), threads }, devices);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
// paired the way a phone pairs: a code from the computer, a token for the device
const paired = devices.pair(devices.createCode().code, "Test iPhone");
if ("error" in paired) throw new Error(paired.error);
const connection = JSON.stringify({ baseUrl: base, token: paired.token, deviceId: paired.device.id });

const browser = await launchChromium();
try {
  for (const scheme of ["light", "dark"] as const) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript((c) => localStorage.setItem("garry.connection", c), connection);
    await page.goto(appUrl);
    const answer = page.getByLabel("answer ASK Add a buy button");
    await answer.waitFor({ timeout: 20_000 }).catch(() => undefined);
    if (shots) await page.screenshot({ path: join(shots, `mobile-${scheme}.png`), fullPage: true });

    // the shared palette, and no old signal red anywhere
    const colours = await page.evaluate(() => {
      const all = new Set<string>();
      for (const el of document.querySelectorAll("body *")) {
        const c = getComputedStyle(el);
        all.add(c.color).add(c.backgroundColor).add(c.borderTopColor);
      }
      return { all: [...all], bg: getComputedStyle(document.querySelector("#root > div") ?? document.body).backgroundColor };
    });
    expect(`${scheme}: the old signal red is gone`, !colours.all.includes("rgb(255, 34, 0)"));
    expect(`${scheme}: the page is ${scheme === "light" ? "paper" : "graphite"}`, colours.all.includes(scheme === "light" ? "rgb(243, 244, 246)" : "rgb(17, 18, 20)"), colours.all.slice(0, 12).join(" "));
    if (scheme === "dark") {
      expect("no errors in the dark", errors.length === 0, errors.join("; "));
      await page.close();
      continue;
    }

    // what needs you comes first, in the agent's words
    const text = await page.locator("body").innerText();
    expect("what needs you comes before the agents and the features", text.indexOf("Needs you") >= 0 && text.indexOf("Needs you") < text.indexOf("Agents") && text.indexOf("Agents") < text.indexOf("Features"), text.slice(0, 300));
    expect("the question is in the agent's own words", text.includes("Should it be red or blue?"));
    expect("the stopped agent is there, with Let it fix", text.includes("Stopped before finishing") && (await page.getByRole("button", { name: "Let it fix" }).count()) === 1);
    // the crew: each face in its state
    const faces = await page.locator('[data-testid^="crew-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect("the crew shows each agent's state on its face", ["crew-dev-wait", "crew-dev-fail", "crew-dev-work", "crew-dev-done"].every((f) => faces.includes(f)), faces.join(", "));
    expect("the working agent says what it does", text.includes("Write NOTES.md"));
    expect("the features follow", text.includes("FEAT-123") && text.includes("New checkout flow with a quick cart"));

    // answering in place: it reaches the agent, and the question goes
    await answer.fill("Blue, like the other actions");
    await page.getByRole("button", { name: "Send" }).click();
    await until(() => threads.store.events(asks).some((e) => e.type === "user" && e.text === "Blue, like the other actions"), 5000);
    expect("an answer from the phone reaches the agent as your next message", threads.store.events(asks).some((e) => e.type === "user" && e.text === "Blue, like the other actions"));
    await until(() => !threads.isRunning(asks));
    await page.getByRole("button", { name: "Let it fix" }).click();
    await until(() => threads.store.events(broke).filter((e) => e.type === "user").length === 2, 5000);
    expect("Let it fix sends the stopped agent back to work", /fix it/.test((threads.store.events(broke).filter((e) => e.type === "user")[1] as { text: string } | undefined)?.text ?? ""));
    await until(() => !threads.isRunning(broke));
    // nothing waits now: Garry rests
    const rest = page.getByRole("img", { name: "Garry rests on a mound of soil beside a sprout" });
    await rest.waitFor({ timeout: 10_000 }).catch(() => undefined);
    expect("with nothing waiting, Garry rests and you are caught up", (await rest.count()) === 1 && (await page.getByText("You are all caught up", { exact: false }).count()) === 1);
    if (shots) await page.screenshot({ path: join(shots, "mobile-caught-up.png"), fullPage: true });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    expect("nothing is wider than the phone", wide <= 390, String(wide));
    expect("no errors in the app", errors.length === 0, errors.join("; "));
    await page.close();
  }
} finally {
  await browser.close();
  threads.stop(busy.id);
  server.close();
  appServer.close();
}

if (failed) {
  console.error(`${failed} iPhone app check(s) failed`);
  process.exit(1);
}
console.log("The iPhone app behaves as expected");
process.exit(0);
