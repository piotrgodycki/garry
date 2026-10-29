/**
 * Regression test for Garry's crew and illustrations, in a real browser
 * against a real Garry server: the pipeline shows each task's agent as its
 * crew icon (the analyst's spec, the developer's code, the reviewer's
 * lens), Live shows each lane's state on its icon (a red mark
 * when it failed), and the empty states tell their story with a picture that
 * says what it shows: connect a repository, nothing in progress, all caught up.
 * Needs the built dashboard and Chromium, like test:dropdown.
 * Run with: pnpm -C garry-tool test:crew (CI runs it too).
 * GARRY_CREW_SHOTS=<dir> also saves screenshots there.
 */
import { cpSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-crew-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../threads/testdata/fake-claude.mjs", import.meta.url));
const ui = fileURLToPath(new URL("../../../garry-ui/dist", import.meta.url));
if (!existsSync(join(ui, "index.html"))) {
  console.error(`the dashboard is not built (${ui}); run pnpm -C garry-ui build first`);
  process.exit(1);
}

const shots = process.env.GARRY_CREW_SHOTS;

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

// nothing yet: no repositories, no agents
const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const registry = join(home, "registry");
cpSync(fileURLToPath(new URL("../../testdata/registry/frontend", import.meta.url)), registry, { recursive: true });
const skills = fileURLToPath(new URL("../../skills", import.meta.url));
const server = createGarryServer({ registry, skills, routing: join(home, "none.json"), threads, ui }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // the empty states, each with its picture
  await page.goto(`${base}/build`);
  const connect = page.getByRole("img", { name: "A cable plugging into a box holding a repository" });
  await connect.waitFor({ timeout: 8000 }).catch(() => undefined);
  expect("Build with no repository shows a repository waiting for its cable, and how to add one", (await connect.count()) === 1 && (await page.getByText("Add your first repository").count()) === 1 && (await page.getByRole("region", { name: "Add a repository" }).count()) === 1);
  if (shots) await page.screenshot({ path: join(shots, "crew-build.png") });
  expect("and no job form until there is a repository to work in", (await page.getByRole("region", { name: "Start a job" }).count()) === 0);
  await page.goto(`${base}/live`);
  await page.getByText("Nothing needs you").waitFor({ timeout: 8000 }).catch(() => undefined);
  expect("Live with nothing waiting: one quiet line, no empty column", (await page.getByText("Nothing needs you").count()) === 1 && (await page.getByRole("region", { name: /Needs you/ }).count()) === 0);
  if (shots) await page.screenshot({ path: join(shots, "crew-live.png") });
  expect("Live with no agents: the sprout, and the way to start one", (await page.getByRole("img", { name: /sprout with a feature tag/ }).count()) === 1 && (await page.getByRole("link", { name: "Start work in Build" }).count()) === 1);
  // the pictures are drawn from the theme: soil and Garry's colours, not fixed ones
  const rest = page.getByRole("img", { name: /sprout with a feature tag/ });
  const fills = await rest.evaluate((svg) => [...svg.querySelectorAll("path, circle")].map((e) => getComputedStyle(e).fill + getComputedStyle(e).stroke));
  await page.emulateMedia({ colorScheme: "dark" });
  const darkFills = await rest.evaluate((svg) => [...svg.querySelectorAll("path, circle")].map((e) => getComputedStyle(e).fill + getComputedStyle(e).stroke));
  // the soil (two shapes), a pebble, the stem and the leaves: each its own colour per theme
  expect("the soil, pebbles and sprout follow the theme", [0, 1, 2, 4, 5].every((i) => fills[i] !== darkFills[i]) && !fills.some((f) => f.startsWith("rgb(0, 0, 0)rgb(0, 0, 0)")), JSON.stringify([fills.slice(0, 7), darkFills.slice(0, 7)]));
  await page.emulateMedia({ colorScheme: "light" });

  // Settings: the GitHub card carries GitHub's logo
  await page.goto(`${base}/settings`);
  const gh = page.getByRole("heading", { name: "GitHub", level: 2 });
  await gh.waitFor();
  expect("Settings shows GitHub's logo by its card's title", (await gh.locator('[data-logo="github"] svg path').count()) === 1);

  // the pipeline: each task's agent is its crew face
  await page.goto(`${base}/build?view=pipeline&feature=FEAT-123`);
  await page.locator("[data-crew]").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  if (shots) await page.screenshot({ path: join(shots, "crew-pipeline.png") });
  const crew = await page.locator("[data-crew]").evaluateAll((s) => s.map((x) => `${x.getAttribute("data-crew")}:${x.getAttribute("data-tool") ?? "-"}`));
  const has = (c: string) => crew.includes(c);
  expect("the analyst shows a spec, the developer code, the reviewer a lens", has("analyst:spec") && has("dev:code") && has("reviewer:review"), [...new Set(crew)].join(", "));
  const titles = await page.locator("[title]").evaluateAll((els) => els.filter((e) => e.querySelector("[data-crew]")).map((e) => `${e.getAttribute("title")}=${e.querySelector("[data-crew]")!.getAttribute("data-crew")}`));
  const mismatched = titles.filter((t) => {
    const [title, role] = t.split("=");
    const agent = title.split(" · ")[1] ?? "";
    return (agent.includes("analyst") && role !== "analyst") || (agent.includes("reviewer") && role !== "reviewer") || (agent.includes("dev") && role !== "dev");
  });
  expect("each task's face is its own agent's", titles.length > 0 && mismatched.length === 0, mismatched.join(", ") || "no tasks");

  // Live: the face shows the lane's state
  const repo = join(home, "shop");
  execFileSync("git", ["init", "-q", repo]);
  execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"]);
  const project = threads.store.addProject(repo, "Shop");
  for (const task of ["FAIL Fix the search", "Write the notes"]) {
    const t = threads.create(project.id, task);
    await until(() => !threads.isRunning(t.id));
  }
  await page.goto(`${base}/live`);
  const lanes = page.getByRole("listbox", { name: "agents" });
  await lanes.getByRole("option").first().waitFor();
  const faces = await lanes.getByRole("option").evaluateAll((os) => os.map((o) => `${o.getAttribute("aria-label")}=${o.querySelector("[data-crew]")?.getAttribute("data-state")}`));
  expect("a lane's face carries its state", faces.includes("FAIL Fix the search, Failed=fail") && faces.includes("Write the notes, Ready=done"), faces.join(" | "));
  const marked = await lanes.getByRole("option").evaluateAll((os) => os.map((o) => `${o.getAttribute("aria-label")}=${o.querySelector('[data-crew] [data-badge="fail"]') ? "marked" : "-"}`));
  expect("a failed agent carries the red mark, and only it", marked.includes("FAIL Fix the search, Failed=marked") && marked.filter((m) => m.endsWith("=marked")).length === 1, marked.join(" | "));
  expect("now something needs you, so its column is back and the quiet line goes", (await page.getByRole("region", { name: /Needs you/ }).count()) === 1 && (await page.getByText("Nothing needs you").count()) === 0);
  expect("no errors in the page", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.error(`${failed} crew check(s) failed`);
  process.exit(1);
}
console.log("The crew and the illustrations behave as expected");
process.exit(0);
