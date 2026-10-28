/**
 * Regression test for the dashboard's dropdowns, in a real browser against a
 * real Garry server: the model picker on Model routing opens with the keyboard
 * and the mouse, moves with the arrows, picks with Enter and saves the choice,
 * closes with Escape or a click elsewhere without changing anything, jumps by
 * typing, and the folder list in Files shows whole, on top of its panel.
 * Needs the built dashboard (pnpm -C garry-ui build) and Chromium
 * (pnpm -C garry-tool exec playwright install chromium; GARRY_CHROMIUM_PATH
 * points at another). Run with: pnpm -C garry-tool test:dropdown (CI runs it too).
 */
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-dropdown-"));
process.env.GARRY_HOME = join(home, ".garry");
const ui = fileURLToPath(new URL("../../../garry-ui/dist", import.meta.url));
if (!existsSync(join(ui, "index.html"))) {
  console.error(`the dashboard is not built (${ui}); run pnpm -C garry-ui build first`);
  process.exit(1);
}

const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");
const { launchChromium } = await import("../shots/browser.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};

const registry = join(home, "registry");
const server = createGarryServer({ registry, skills: join(home, "none"), routing: join(home, "none.json"), ui }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const specModel = async () => ((await (await fetch(`${base}/api/routing`)).json()) as { stages: Record<string, { model: string }> }).stages.spec?.model;

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/routing`);
  const picker = page.getByRole("combobox", { name: "model for spec" });
  await picker.waitFor();
  const before = await specModel();
  expect("the default starts on Opus 5.5", before === "claude-opus-5-5", String(before));
  expect("it shows the chosen model", (await picker.innerText()).includes("Opus 5.5"));

  // keyboard: open, move down one, pick
  await picker.focus();
  await page.keyboard.press("ArrowDown");
  const list = page.getByRole("listbox", { name: "model for spec" });
  expect("the arrow key opens the list", await list.isVisible());
  expect("it says it is open", (await picker.getAttribute("aria-expanded")) === "true");
  const options = await list.getByRole("option").allInnerTexts();
  expect("it lists the current models, not the earlier ones", options.join("|").includes("Sonnet 5.5") && !options.join("|").includes("Opus 4.8"), options.join("|"));
  expect("the chosen one is marked", (await list.getByRole("option", { selected: true }).innerText()).includes("Opus 5.5"));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  expect("Enter picks the next model and saves it", (await specModel()) === "claude-sonnet-5-5" && !(await list.isVisible()), String(await specModel()));
  expect("focus returns to the picker", await picker.evaluate((el) => el === document.activeElement));

  // Escape and a click elsewhere close without changing anything
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  expect("Escape closes without picking", !(await list.isVisible()) && (await specModel()) === "claude-sonnet-5-5");
  await picker.click();
  await page.mouse.click(5, 880);
  expect("a click elsewhere closes it", !(await list.isVisible()) && (await specModel()) === "claude-sonnet-5-5");

  // the mouse: open, click an option
  await picker.click();
  await list.getByRole("option", { name: /Haiku 5\.5/ }).click();
  await page.waitForTimeout(400);
  expect("a click on an option picks it", (await specModel()) === "claude-haiku-5-5");

  // typing on a closed picker jumps to a match, like a select
  await picker.focus();
  await page.keyboard.type("O");
  await page.waitForTimeout(400);
  expect("typing picks the first match", (await specModel()) === "claude-opus-5-5", String(await specModel()));

  // further down a page: opening scrolls it into view, and the list stays open and follows the page
  await page.goto(`${base}/registry`);
  await page.getByRole("radio", { name: /^API/ }).click();
  const stack = page.getByRole("combobox", { name: "stack" });
  await stack.click();
  const stacks = page.getByRole("listbox", { name: "stack" });
  await page.waitForTimeout(300);
  expect("a picker further down a page opens and stays open", await stacks.isVisible());
  const at = async () => ({ list: (await stacks.boundingBox())!, picker: (await stack.boundingBox())! });
  const beside = (b: { list: { y: number; height: number }; picker: { y: number; height: number } }) =>
    Math.abs(b.list.y - (b.picker.y + b.picker.height + 4)) < 3 || Math.abs(b.list.y + b.list.height - (b.picker.y - 4)) < 3;
  const first = await at();
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(300);
  const then = await at();
  expect("it follows its picker when the page scrolls", (await stacks.isVisible()) && beside(first) && beside(then) && then.picker.y < first.picker.y, JSON.stringify({ first, then }));
  await stacks.getByRole("option", { name: /Ready-made|PERN/ }).first().click().catch(() => undefined);
  await page.keyboard.press("Escape");

  // the Files explorer clips what overflows it; the folder list must still show whole
  await page.goto(`${base}/files`);
  const folder = page.getByRole("combobox", { name: "folder" });
  await folder.click();
  const folders = page.getByRole("listbox", { name: "folder" });
  // its last option is on top at its own centre: nothing clips or covers it
  const onTop = await folders.evaluate((el) => {
    const last = el.querySelector('[role="option"]:last-of-type') as HTMLElement;
    const r = last.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(hit && last.contains(hit)) && r.bottom <= window.innerHeight;
  });
  expect("the folder list shows whole, on top of the Files panel", onTop);
  expect("no errors in the page", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.error(`${failed} dropdown check(s) failed`);
  process.exit(1);
}
console.log("the dropdowns behave as expected");
process.exit(0);
