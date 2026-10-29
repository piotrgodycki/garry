/**
 * Regression test for removing projects in Settings, in a real browser against
 * a real Garry server: every project has Remove, which asks in place first
 * (what goes, what stays) and can be cancelled; removing the active project
 * hands over to another and the page follows; the last project cannot be
 * removed. Needs the built dashboard and Chromium, like test:dropdown.
 * Run with: pnpm -C garry-tool test:projects-ui (CI runs it too).
 */
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-projects-ui-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
const ui = fileURLToPath(new URL("../../../garry-ui/dist", import.meta.url));
if (!existsSync(join(ui, "index.html"))) {
  console.error(`the dashboard is not built (${ui}); run pnpm -C garry-ui build first`);
  process.exit(1);
}

const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { createGarryProject, listGarryProjects, useGarryProject } = await import("../project/store.js");
const { launchChromium } = await import("../shots/browser.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};

const shop = createGarryProject({ name: "Shop" });
const blog = createGarryProject({ name: "Blog" });
useGarryProject(shop.id);
const server = createGarryServer({ registry: shop.path, skills: join(home, "none"), routing: join(home, "none.json"), threads: new ThreadManager(new ThreadStore(process.env.GARRY_HOME!)), ui }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const ids = () => listGarryProjects().projects.map((p) => p.id).join(",");

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/settings`);
  const removeButtons = page.getByRole("button", { name: "Remove", exact: true });
  await removeButtons.first().waitFor();
  expect("every project has Remove, the default and the active one too", (await removeButtons.count()) === 3 && (await removeButtons.evaluateAll((b) => b.every((x) => !(x as HTMLButtonElement).disabled))));

  // asks in place, and Cancel keeps it
  const blogRow = page.getByRole("group", { name: "project Blog" });
  await blogRow.getByRole("button", { name: "Remove", exact: true }).click();
  const ask = page.getByRole("alertdialog", { name: "remove Blog" });
  expect("Remove asks first, saying what goes and what stays", (await ask.isVisible()) && /deleted[\s\S]*no repositories in Build/.test(await ask.innerText()), await ask.innerText().catch(() => ""));
  await ask.getByRole("button", { name: "Cancel" }).click();
  expect("Cancel keeps it", !(await ask.isVisible()) && ids().includes(blog.id));

  await blogRow.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("alertdialog", { name: "remove Blog" }).getByRole("button", { name: "Remove Blog" }).click();
  await page.getByText("Removed Blog").waitFor({ timeout: 5000 }).catch(() => undefined);
  expect("confirming removes it", !ids().includes(blog.id) && (await page.getByText("Removed Blog").isVisible()), ids());

  // the active one: another takes over and the page follows
  const shopRow = page.getByRole("group", { name: "project Shop" });
  await shopRow.getByRole("button", { name: "Remove", exact: true }).click();
  const askShop = page.getByRole("alertdialog", { name: "remove Shop" });
  expect("removing the active project says which one takes over", (await askShop.innerText()).includes("Garry switches to Default"), await askShop.innerText());
  await Promise.all([page.waitForEvent("load"), askShop.getByRole("button", { name: "Remove Shop" }).click()]);
  await page.getByRole("button", { name: "Remove", exact: true }).first().waitFor();
  expect("the default takes over and the page shows it", listGarryProjects().active === "default" && !ids().includes(shop.id) && (await page.getByRole("button", { name: /Project\s*Default/ }).count()) === 1);

  // on a phone the question fits the screen, a long name included
  await page.setViewportSize({ width: 390, height: 844 });
  const long = createGarryProject({ name: "A project with a rather long name for a phone" });
  await page.reload();
  await page.getByRole("group", { name: `project ${long.name}` }).getByRole("button", { name: "Remove", exact: true }).click();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const nameShown = await page.getByRole("group", { name: "project Default" }).locator("span", { hasText: /^Default/ }).last().evaluate((e) => e.scrollWidth <= e.clientWidth);
  expect("on a phone the question fits the screen and names stay whole", wide <= 0 && nameShown, `${wide}px too wide, name whole: ${nameShown}`);
  await page.getByRole("alertdialog", { name: `remove ${long.name}` }).getByRole("button", { name: `Remove ${long.name}` }).click();
  await page.getByText(`Removed ${long.name}`).waitFor({ timeout: 5000 }).catch(() => undefined);
  expect("and removes it", !ids().includes(long.id));

  // the last one stays
  const last = page.getByRole("button", { name: "Remove", exact: true });
  expect("the last project cannot be removed", (await last.count()) === 1 && (await last.isDisabled()) && (await last.getAttribute("title"))?.includes("make another one first") === true);
  expect("no errors in the page", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.error(`${failed} project removal check(s) failed`);
  process.exit(1);
}
console.log("Removing projects behaves as expected");
process.exit(0);
