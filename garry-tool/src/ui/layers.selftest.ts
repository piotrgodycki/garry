/**
 * Regression test for Layers and per-project skills, in a real browser against
 * a real Garry server: pick the project, a repository or a service; turn skills
 * on, or off again where a wider layer turned them on; pick stacks; write
 * notes; save; and see what an agent in the repository gets, down to the text
 * it reads. Skills page: install a skill for one repository, and give a local
 * skill to every project or only where a layer turns it on. Needs the built
 * dashboard and Chromium, like test:dropdown.
 * Run with: pnpm -C garry-tool test:layers-ui (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-layers-ui-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_SKILLS_HOME = join(home, "skills");
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
const { addService } = await import("../registry/services.js");
const { saveStack } = await import("../registry/stacks.js");
const { readLayers } = await import("../registry/layers.js");
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
const registry = join(home, "registry");
const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
threads.store.addProject(repo, "shop");
addService(registry, { name: "api", kind: "backend", repo });
saveStack(registry, { name: "web", technologies: [{ id: "typescript" }] });
saveStack(registry, { name: "node-api", technologies: [{ id: "typescript" }] });
const builtin = join(home, "builtin");
mkdirSync(builtin, { recursive: true });
writeFileSync(join(builtin, "manifest.json"), JSON.stringify({ skills: [] }));

const server = createGarryServer({ registry, skills: builtin, routing: join(home, "none.json"), threads, ui }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const md = (name: string) => `---\nname: ${name}\ndescription: Checks ${name} in the changed files.\nstage: review\n---\n\nRead the diff and check ${name}.\n`;
const install = (name: string, scope?: unknown) => fetch(`${base}/api/skills/install`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: md(name), scope }) });
await install("house-style");
await install("tone-check", { level: "repo", name: "blog" });

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/layers`);
  const where = page.getByRole("radiogroup", { name: "layer to change" });
  await where.getByRole("radio").first().waitFor();
  expect("Layers is in the menu, under Project", (await page.getByRole("navigation", { name: "main" }).getByRole("link", { name: "Layers" }).getAttribute("aria-current")) === "page");
  expect("the layers to pick: the project, its repository, its service with where it lives", (await where.getByRole("radio", { name: /^Whole project/ }).getAttribute("aria-checked")) === "true" && (await where.getByRole("radio", { name: /^shop/ }).count()) === 1 && (await where.getByRole("radio", { name: /^api in shop/ }).count()) === 1);

  const editor = page.getByRole("region", { name: "Whole project" });
  const skill = (r: typeof editor, n: string) => r.getByRole("listitem").filter({ hasText: n });
  expect("a skill for every project starts on, and says so", (await skill(editor, "house-style").getByRole("checkbox").isChecked()) && (await skill(editor, "house-style").innerText()).includes("from every project"));
  expect("a skill installed for another repository starts off", !(await skill(editor, "tone-check").getByRole("checkbox").isChecked()));
  const save = page.getByRole("button", { name: "Save the layer" });
  expect("nothing to save before a change", await save.isDisabled());
  await skill(editor, "tone-check").getByRole("checkbox").check();
  await editor.getByRole("checkbox", { name: "web" }).check();
  await editor.getByRole("textbox", { name: "Notes for the agents" }).fill("Write in British English.");
  await save.click();
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  let l = readLayers(registry);
  expect("the project's layer is saved: the skill, the stack, the notes", JSON.stringify(l.project) === JSON.stringify({ skills: ["tone-check"], skillsOff: [], stacks: ["web"], notes: "Write in British English." }), JSON.stringify(l.project));

  const gets = page.getByRole("complementary", { name: "What an agent gets" });
  const got = (label: string) => gets.getByRole("region", { name: label });
  await got("skills it gets").getByText("tone-check").waitFor();
  expect("what an agent in shop gets, with where each comes from", (await got("skills it gets").innerText()).includes("house-style\nevery project") && (await got("skills it gets").innerText()).includes("tone-check\nproject") && (await got("stacks it keeps to").innerText()).includes("web"), await gets.innerText());
  await gets.getByText("The exact text the agent reads").click();
  expect("down to the text the agent reads", (await gets.locator("pre").innerText()).includes("Write in British English."));

  // the repository: what the project turned on shows as inherited and can be turned off here
  await where.getByRole("radio", { name: /^shop/ }).click();
  const repoEditor = page.getByRole("region", { name: "shop" });
  expect("a repository starts from the project's skills", (await skill(repoEditor, "tone-check").innerText()).includes("from the project") && (await skill(repoEditor, "tone-check").getByRole("checkbox").isChecked()));
  expect("and says it keeps the project's stacks", (await repoEditor.innerText()).includes("keep the project's: web"));
  await skill(repoEditor, "house-style").getByRole("checkbox").uncheck();
  expect("turning off an inherited skill says so", (await skill(repoEditor, "house-style").innerText()).includes("turned off here"));
  await page.getByRole("button", { name: "Save the layer" }).click();
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  l = readLayers(registry);
  expect("the repository's layer keeps only the change", JSON.stringify(l.repos.shop) === JSON.stringify({ skills: [], skillsOff: ["house-style"], stacks: [], notes: "" }), JSON.stringify(l.repos));
  await gets.getByText("house-style").waitFor({ state: "detached" });
  expect("and the agent no longer gets that skill", !(await got("skills it gets").innerText()).includes("house-style"));

  // the service: added for agents in the repository it lives in
  await where.getByRole("radio", { name: /^api in shop/ }).click();
  const svc = page.getByRole("region", { name: "api" });
  const svcText = await svc.innerText();
  expect("a service says whose agents get it", svcText.includes("Added for agents in shop"), svcText);
  expect("a service starts from its repository: off there stays off", !(await skill(svc, "house-style").getByRole("checkbox").isChecked()) && (await skill(svc, "tone-check").getByRole("checkbox").isChecked()));
  await svc.getByRole("textbox", { name: "Notes for the agents" }).fill("The API is public.");
  await page.getByRole("button", { name: "Undo changes" }).click();
  expect("undo puts the layer back", (await svc.getByRole("textbox", { name: "Notes for the agents" }).inputValue()) === "" && (await page.getByRole("button", { name: "Save the layer" }).isDisabled()));

  // Skills: install one for a single repository, and change who gets one later
  await page.goto(`${base}/skills`);
  await page.getByRole("button", { name: "Install skill" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "SKILL.md", mimeType: "text/markdown", buffer: Buffer.from(md("sql-review")) });
  await dialog.getByRole("combobox", { name: "who gets the skill" }).click();
  await page.getByRole("option", { name: /Repository shop/ }).click();
  const installBtn = dialog.getByRole("button", { name: "Install locally" });
  await installBtn.waitFor();
  for (let i = 0; i < 50 && (await installBtn.isDisabled()); i++) await page.waitForTimeout(100);
  await installBtn.click();
  await dialog.waitFor({ state: "detached" });
  l = readLayers(registry);
  const side = (n: string) => JSON.parse(readFileSync(join(home, "skills", n, "garry.json"), "utf8")) as { everywhere: boolean };
  expect("a skill installed for one repository is turned on there only", l.repos.shop?.skills.includes("sql-review") === true && side("sql-review").everywhere === false, JSON.stringify(l.repos.shop));
  const card = page.locator(".card").filter({ hasText: "Checks sql-review" });
  expect("its card says agents get it where a layer turns it on", (await card.innerText()).includes("where a layer turns it on"));
  await card.getByRole("button", { name: "Give to every project" }).click();
  await card.getByRole("button", { name: "Only where turned on" }).waitFor();
  expect("and it can go to every project", side("sql-review").everywhere === true);

  // small screens: one column, nothing wider than the screen
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/layers`);
  await page.getByRole("radiogroup", { name: "layer to change" }).waitFor();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect("on a phone Layers fits the screen", wide <= 0, `${wide}px too wide`);
  expect("no errors in the page", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.error(`${failed} Layers check(s) failed`);
  process.exit(1);
}
console.log("Layers behave as expected");
process.exit(0);
