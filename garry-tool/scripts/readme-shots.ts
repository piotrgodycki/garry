/**
 * The README's screenshots (docs/screenshots), taken from the real dashboard
 * and the iPhone app's web build against a real Garry server with a demo
 * project: agents that ask, work, stopped and are ready (a stand-in for
 * Claude Code runs them), the frontend test registry, and an architecture
 * board from a ready-made template. Run after a change to how Garry looks:
 *   pnpm -C garry-ui build && pnpm -C garry-mobile export:web
 *   pnpm -C garry-tool readme-shots
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-readme-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../src/threads/testdata/fake-claude.mjs", import.meta.url));
const ui = fileURLToPath(new URL("../../garry-ui/dist", import.meta.url));
const phoneApp = fileURLToPath(new URL("../../garry-mobile/dist", import.meta.url));
const out = fileURLToPath(new URL("../../docs/screenshots", import.meta.url));
if (!existsSync(join(ui, "index.html"))) throw new Error("build the dashboard first: pnpm -C garry-ui build");
mkdirSync(out, { recursive: true });

const { createGarryServer } = await import("../src/server/server.js");
const { DeviceStore } = await import("../src/server/auth.js");
const { ThreadManager } = await import("../src/threads/manager.js");
const { ThreadStore } = await import("../src/threads/store.js");
const { saveArchitecture } = await import("../src/registry/architecture.js");
const { saveLayer } = await import("../src/registry/layers.js");
const { ARCHITECTURE_TEMPLATES } = await import("../src/registry/schema/templates.js");
const { launchChromium } = await import("../src/shots/browser.js");

const until = async (f: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
};

// the demo project: a shop with agents in every state
const repo = join(home, "shop");
execFileSync("git", ["init", "-q", repo]);
writeFileSync(join(repo, "README.md"), "# shop\n");
execFileSync("git", ["-C", repo, "add", "-A"]);
execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const project = threads.store.addProject(repo, "Shop");
const minAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const past = (title: string, from: number, to: number, said: string, cost: number) => {
  const t = threads.store.save({ id: threads.store.newId(), projectId: project.id, title, status: "idle", branch: `garry/${title.toLowerCase().replace(/\W+/g, "-")}`, worktree: repo, baseSha: "0", sessionId: null, createdAt: minAgo(from), updatedAt: minAgo(to) });
  threads.store.append(t.id, { type: "user", text: title, at: minAgo(from) });
  threads.store.append(t.id, { type: "tool", id: "a", name: "Read", summary: "src/cart/index.ts", at: minAgo(from - 2) });
  threads.store.append(t.id, { type: "tool", id: "b", name: "Edit", summary: "src/cart/QuickCart.tsx", at: minAgo(from - 6) });
  threads.store.append(t.id, { type: "text", text: said, at: minAgo(to) });
  threads.store.append(t.id, { type: "turn_end", ok: true, costUsd: cost, at: minAgo(to) });
  return t.id;
};
past("Plan the summer sale", 44, 27, "Here is a plan for the sale: banners, a countdown and 20% off shoes.\nShould it start on Monday?", 0.12);
past("Move the cart to its own service", 52, 31, "The cart now lives in cart-service, with its contract updated.", 0.21);
const run = async (task: string) => {
  const t = threads.create(project.id, task);
  await until(() => !threads.isRunning(t.id));
  return t.id;
};
const ready = await run("Write the release notes for the spring sale");
await run("ASK Add a buy button to the product page");
await run("FAIL Fix the search prices");
const busy = threads.create(project.id, "BUSY Add a checkout page with a quick cart");
await until(() => threads.store.events(busy.id).some((e) => e.type === "tool"));

const registry = join(home, "registry");
cpSync(fileURLToPath(new URL("../testdata/registry/frontend", import.meta.url)), registry, { recursive: true });
saveArchitecture(registry, ARCHITECTURE_TEMPLATES.find((t) => t.id === "aws-serverless")!.architecture);
saveLayer(registry, { level: "project" }, { notes: "Write in British English. Run the tests before you finish." });
saveLayer(registry, { level: "repo", name: "Shop" }, { notes: "Shop ships every Friday: keep changes small." });

const devices = new DeviceStore(join(home, "devices.json"));
const server = createGarryServer({ registry, skills: fileURLToPath(new URL("../skills", import.meta.url)), routing: join(home, "none.json"), threads, ui }, devices);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const shoot = async (name: string, path: string, ready: string, scrollTo?: string) => {
    await page.goto(`${base}${path}`);
    await page.locator(ready).first().waitFor({ timeout: 15_000 });
    // what the picture is about, at the top of the window
    if (scrollTo) await page.locator(scrollTo).first().evaluate((el) => (el.scrollIntoView({ block: "start" }), window.scrollBy(0, -72)));
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(out, `${name}.png`) });
    console.log(`ok   ${name}.png`);
  };
  // something said to Garry: one runs, one waits
  for (const text of ["BUSY tidy up the cart service", "then rename the checkout buttons to match the design"]) await fetch(`${base}/api/garry/queue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  await shoot("live", "/live", '[role="option"]');
  await shoot("dashboard", "/", "canvas[data-garry-crawl]");
  await shoot("build", "/build", "textarea");
  await shoot("thread", `/build/${ready}`, "text=wrote NOTES.md");
  await shoot("pipeline", "/build?view=pipeline&feature=FEAT-123", "[data-crew]");
  await shoot("architecture", "/architecture", ".react-flow__node");
  await shoot("stacks", "/stacks", "h1");
  await shoot("layers", "/layers", '[role="radiogroup"]');
  await shoot("routing", "/routing", "h1");
  await shoot("settings", "/settings", "h1");
  // the board alone, in both themes
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`${base}/architecture`);
    await page.locator(".react-flow__node").first().waitFor();
    // the command line pinned at the foot would cover the board's lower edge
    await page.addStyleTag({ content: ".cmdline { display: none !important; }" });
    await page.waitForTimeout(900);
    await page.locator(".react-flow").first().screenshot({ path: join(out, `architecture-board-${scheme}.png`) });
    console.log(`ok   architecture-board-${scheme}.png`);
  }
  await page.close();

  // the iPhone app, paired the way a phone pairs
  if (existsSync(join(phoneApp, "index.html"))) {
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf" };
    const statics = createServer((req, res) => {
      const file = join(phoneApp, normalize(new URL(req.url ?? "/", "http://x").pathname).replace(/^(\.\.[/\\])+/, ""));
      const hit = file.startsWith(phoneApp) && existsSync(file) && extname(file) ? file : join(phoneApp, "index.html");
      res.writeHead(200, { "content-type": types[extname(hit)] ?? "application/octet-stream" });
      res.end(readFileSync(hit));
    });
    await new Promise<void>((r) => statics.listen(0, "127.0.0.1", r));
    const appUrl = `http://127.0.0.1:${(statics.address() as AddressInfo).port}`;
    process.env.GARRY_UI_ORIGINS = appUrl;
    const paired = devices.pair(devices.createCode().code, "README iPhone");
    if ("error" in paired) throw new Error(paired.error);
    for (const scheme of ["light", "dark"] as const) {
      const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, colorScheme: scheme });
      await phone.addInitScript((c) => localStorage.setItem("garry.connection", c), JSON.stringify({ baseUrl: base, token: paired.token, deviceId: paired.device.id }));
      await phone.goto(appUrl);
      await phone.getByText("Needs you").first().waitFor({ timeout: 20_000 });
      await phone.waitForTimeout(1200);
      await phone.screenshot({ path: join(out, `iphone-${scheme}.png`) });
      console.log(`ok   iphone-${scheme}.png`);
      await phone.close();
    }
    statics.close();
  } else console.log("skip the iPhone app: pnpm -C garry-mobile export:web first");
} finally {
  await browser.close();
  threads.stop(busy.id);
  server.close();
}
process.exit(0);
