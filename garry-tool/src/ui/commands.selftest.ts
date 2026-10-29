/**
 * Regression test, in a real browser, for commands after a slash in Garry's
 * field and the Memory page: typing / suggests the commands, a few letters
 * narrow them, one that needs words waits for them, Enter runs it and Garry
 * answers above the field; /memory opens Memory, /new opens the job, an
 * unknown command says so; Memory adds and forgets. A stand-in for Claude
 * Code runs the agents. Needs the built dashboard and Chromium.
 * Run with: pnpm -C garry-tool test:commands-ui (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-commands-ui-"));
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
const { readMemory } = await import("../garry/memory.js");
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
threads.store.addProject(repo, "shop");
const registry = join(home, "registry");
const server = createGarryServer({ registry, skills: join(home, "none"), routing: join(home, "none.json"), threads, ui }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/`);
  const field = page.getByRole("combobox", { name: "tell Garry" });
  const list = page.getByRole("listbox", { name: "commands" });
  const said = page.locator(".garrySaid");

  await field.fill("/");
  await list.getByRole("option").first().waitFor();
  const all = await list.getByRole("option").allInnerTexts();
  expect("a slash suggests every command, with what each does", ["/remember", "/forget", "/memory", "/new", "/pair", "/stop", "/help"].every((c) => all.some((o) => o.startsWith(c))) && all.some((o) => o.includes("keep it in mind")), all.join(" | "));
  await field.fill("/rem");
  expect("a few letters narrow them", (await list.getByRole("option").count()) === 1 && (await list.getByRole("option").innerText()).includes("<what to keep in mind>"));
  await field.press("Enter");
  expect("a command that needs words waits for them", (await field.inputValue()) === "/remember " && readMemory(registry).length === 0);
  await field.pressSequentially("We deploy on Fridays");
  await field.press("Enter");
  await said.waitFor();
  expect("Enter runs it, and Garry answers above the field", (await said.innerText()) === "I will remember: We deploy on Fridays" && readMemory(registry)[0]?.text === "We deploy on Fridays" && (await field.inputValue()) === "");
  expect("a command is not put in line as a message", ((await fetch(`${base}/api/garry/queue`).then((r) => r.json())) as { items: unknown[] }).items.length === 0);

  await field.fill("/nope");
  await field.press("Enter");
  await page.locator(".garryError").waitFor();
  expect("an unknown command says so", (await page.locator(".garryError").innerText()).includes("no command /nope"));

  await field.fill("/help");
  await field.press("Enter");
  await said.filter({ hasText: "/remember" }).waitFor();
  expect("/help lists them all", (await said.innerText()).split("\n").length === 7);

  await field.fill("/memory");
  await field.press("Enter");
  await page.waitForURL("**/memory");
  const remembered = page.getByRole("list", { name: "what Garry remembers" });
  await remembered.getByRole("listitem").first().waitFor();
  expect("/memory opens Memory, with what Garry remembers", (await remembered.innerText()).includes("We deploy on Fridays") && (await page.getByRole("navigation", { name: "main" }).getByRole("link", { name: "Memory" }).getAttribute("aria-current")) === "page");
  await page.getByRole("textbox", { name: "Something to remember" }).fill("Prices are in euros");
  await page.getByRole("button", { name: "Remember" }).click();
  await remembered.getByText("Prices are in euros").waitFor();
  expect("Memory adds one, numbered after the others", (await remembered.getByRole("listitem").nth(1).innerText()).startsWith("2") && readMemory(registry).length === 2);
  await page.getByRole("button", { name: "forget: We deploy on Fridays" }).click();
  await remembered.getByText("We deploy on Fridays").waitFor({ state: "detached" });
  expect("and forgets one", readMemory(registry).map((e) => e.text).join() === "Prices are in euros");

  await field.fill("/new add a footer");
  await field.press("Enter");
  await page.waitForURL(/\/build\/[a-z0-9]+$/);
  const t = threads.store.threads().find((x) => x.title === "add a footer");
  expect("/new starts the job and opens it", !!t && page.url().endsWith(`/build/${t.id}`));
  expect("no errors in the page", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
  server.close();
  for (const t of threads.store.threads()) threads.stop(t.id);
}

if (failed) {
  console.error(`${failed} commands UI check(s) failed`);
  process.exit(1);
}
console.log("commands and Memory behave as expected");
process.exit(0);
