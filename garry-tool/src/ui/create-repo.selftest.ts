/**
 * Regression test, in a real browser, for creating a repository's home on
 * GitHub from the dashboard: a piece of work in a repository not on GitHub
 * offers to create it, named as in Garry, before the pull request (the name
 * can be changed and it can be public); the repository's settings in Build
 * offer the same on their own. A stand-in for GitHub's API and local bare
 * repositories as the remotes. Needs the built dashboard and Chromium.
 * Run with: pnpm -C garry-tool test:create-repo-ui (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-create-repo-ui-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_GITHUB_TOKEN = "ghp_" + "c".repeat(36);
const remotes = join(home, "remotes");
const ui = fileURLToPath(new URL("../../../garry-ui/dist", import.meta.url));
if (!existsSync(join(ui, "index.html"))) {
  console.error(`the dashboard is not built (${ui}); run pnpm -C garry-ui build first`);
  process.exit(1);
}

const made: { owner: string; name: string; private: boolean }[] = [];
const github = createServer((req, res) => {
  const send = (code: number, body: unknown) => (res.writeHead(code, { "content-type": "application/json" }), res.end(JSON.stringify(body)));
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    if (req.method === "GET" && req.url === "/user") return send(200, { login: "octo" });
    const create = /^\/(?:user|orgs\/([^/]+))\/repos$/.exec(req.url ?? "");
    if (req.method === "POST" && create) {
      const b = JSON.parse(raw) as { name: string; private: boolean };
      const owner = create[1] ?? "octo";
      made.push({ owner, name: b.name, private: b.private });
      execFileSync("git", ["init", "-q", "--bare", join(remotes, owner, `${b.name}.git`)]);
      return send(201, { name: b.name, html_url: `https://github.com/${owner}/${b.name}`, owner: { login: owner } });
    }
    if (req.method === "POST" && /\/pulls$/.test(req.url ?? "")) return send(201, { number: 1, html_url: "https://github.com/octo/x/pull/1" });
    if (req.url?.includes("/labels")) return send(200, []);
    send(404, {});
  });
});
await new Promise<void>((r) => github.listen(0, "127.0.0.1", r));
process.env.GARRY_GITHUB_API = `http://127.0.0.1:${(github.address() as AddressInfo).port}`;

const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { addWorktree, commitAll, git } = await import("../threads/git.js");
const { launchChromium } = await import("../shots/browser.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};

const newRepo = (dir: string) => {
  const path = join(home, dir);
  execFileSync("git", ["init", "-q", "-b", "main", path]);
  writeFileSync(join(path, "README.md"), `# ${dir}\n`);
  git(path, ["add", "-A"]);
  git(path, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
  git(path, ["config", `url.file://${remotes}/.insteadOf`, "https://github.com/"]);
  return path;
};
const store = new ThreadStore(process.env.GARRY_HOME!);
const threads = new ThreadManager(store);
const shopPath = newRepo("shop");
const shop = store.addProject(shopPath, "My Shop");
const id = store.newId();
const worktree = join(store.root, "worktrees", id);
const baseSha = addWorktree(shopPath, worktree, "garry/buy-button");
git(worktree, ["config", "user.name", "t"]);
git(worktree, ["config", "user.email", "t@t"]);
writeFileSync(join(worktree, "button.txt"), "buy\n");
const at = new Date().toISOString();
const t = store.save({ id, projectId: shop.id, title: "Add a buy button", status: "idle", branch: "garry/buy-button", worktree, baseSha, sessionId: null, createdAt: at, updatedAt: at });
t.commit = commitAll(worktree, "Add a buy button");
store.save(t);
const blogPath = newRepo("blog");
store.addProject(blogPath, "Blog");

const server = createGarryServer({ registry: join(home, "registry"), skills: join(home, "none"), routing: join(home, "none.json"), threads, ui }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // newer browsers return a promise from the scroll methods; behave like them here too
  await page.addInitScript("{ const s = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = function (...a) { s.apply(this, a); return Promise.resolve(); }; }");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 400)));

  // a piece of work in a repository not on GitHub
  await page.goto(`${base}/build/${t.id}`);
  await page.getByRole("button", { name: "Open pull request" }).click();
  const box = page.getByRole("dialog", { name: "Confirm the push" });
  await box.waitFor();
  expect("it says the repository is not on GitHub yet and Garry creates it first", (await box.innerText()).includes("Not on GitHub yet: Garry creates it first"));
  const name = box.getByRole("textbox", { name: "new GitHub repository name" });
  expect("proposed under your account, named as in Garry", (await name.inputValue()) === "My-Shop" && (await box.innerText()).includes("octo /"));
  expect("nothing is made before the yes", made.length === 0);
  await name.fill("shop-web");
  await box.getByRole("checkbox", { name: "Private" }).uncheck();
  await box.getByRole("button", { name: "Create the repository, push and open pull request" }).click();
  await box.waitFor({ state: "detached" });
  expect("created with the changed name, public as asked", made.length === 1 && made[0].name === "shop-web" && made[0].private === false, JSON.stringify(made));
  expect("and added as origin", git(shopPath, ["config", "--get", "remote.origin.url"]).trim() === "https://github.com/octo/shop-web.git");
  const logged = await page
    .getByText("Created https://github.com/octo/shop-web")
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  // when it is not there, say what the server logged and what the page shows, so a failure elsewhere can be read
  const why = logged ? "" : `server log: ${JSON.stringify(store.events(t.id).map((e) => `${e.type}${"action" in e ? `:${e.action}:${e.detail}` : ""}`))}; page errors: ${errors.join("; ")}; console: ${consoleErrors.join(" | ")}; url: ${page.url()}; page: ${(await page.locator("body").innerText().catch(() => "")).slice(0, 1500)}`;
  expect("the work's log says so", logged, why);

  // a repository's settings in Build offer the same on their own
  await page.goto(`${base}/build`);
  const job = page.getByRole("region", { name: "Start a job" });
  await job.getByRole("combobox", { name: "repository" }).click();
  await page.getByRole("listbox", { name: "repository" }).getByRole("option", { name: /^Blog/ }).click();
  await job.getByRole("button", { name: "Branch and push settings" }).click();
  const create = job.getByRole("group", { name: "create it on GitHub" });
  await create.waitFor();
  expect("the settings propose the name as in Garry", (await create.getByRole("textbox", { name: "GitHub repository name" }).inputValue()) === "Blog" && (await create.getByRole("textbox", { name: "GitHub owner" }).inputValue()) === "octo");
  await create.getByRole("textbox", { name: "GitHub owner" }).fill("acme");
  await create.getByRole("button", { name: "Create acme/Blog on GitHub" }).click();
  await job.getByRole("link", { name: "acme/Blog" }).waitFor();
  expect("created in the organization, private by default, and the settings now show where it is", made.at(-1)?.owner === "acme" && made.at(-1)?.private === true && (await job.getByRole("link", { name: "acme/Blog" }).getAttribute("href")) === "https://github.com/acme/Blog");
  const shopSettings = page.getByRole("region", { name: "Start a job" });
  await shopSettings.getByRole("combobox", { name: "repository" }).click();
  await page.getByRole("listbox", { name: "repository" }).getByRole("option", { name: /^My Shop/ }).click();
  await shopSettings.getByRole("link", { name: "octo/shop-web" }).waitFor();
  expect("a repository already on GitHub shows where", true);
  expect("no errors in the page", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
  server.close();
  github.close();
}

if (failed) {
  console.error(`${failed} create-repo UI check(s) failed`);
  process.exit(1);
}
console.log("creating repositories from the dashboard behaves as expected");
process.exit(0);
