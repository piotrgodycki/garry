/**
 * Regression test for creating a repository's home on GitHub, named as it is
 * in Garry and only on a person's yes: the name GitHub gets, the proposal in
 * the push preview, nothing made without the yes (or before an "ask first"
 * yes), creating it (yours or an organization's, private by default) with
 * origin added and the branch pushed, then the pull request; a name already
 * taken, an origin elsewhere, and the HTTP routes. A stand-in for GitHub's API
 * and local bare repositories as the remotes.
 * Run with: pnpm -C garry-tool test:create-repo (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-create-repo-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_GITHUB_TOKEN = "ghp_" + "b".repeat(36);
const remotes = join(home, "remotes");

const made: { path: string; name: string; private: boolean }[] = [];
const opened: { repo: string; head: string; base: string }[] = [];
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
      if (b.name === "taken") return send(422, { message: "name already exists on this account" });
      made.push({ path: req.url!, name: b.name, private: b.private });
      execFileSync("git", ["init", "-q", "--bare", join(remotes, owner, `${b.name}.git`)]);
      return send(201, { name: b.name, html_url: `https://github.com/${owner}/${b.name}`, owner: { login: owner } });
    }
    const pulls = /^\/repos\/([^/]+\/[^/]+)\/pulls$/.exec(req.url ?? "");
    if (req.method === "POST" && pulls) {
      const b = JSON.parse(raw) as { head: string; base: string };
      opened.push({ repo: pulls[1], head: b.head, base: b.base });
      return send(201, { number: opened.length, html_url: `https://github.com/${pulls[1]}/pull/${opened.length}` });
    }
    if (req.url?.includes("/labels")) return send(200, []);
    send(404, {});
  });
});
await new Promise<void>((r) => github.listen(0, "127.0.0.1", r));
process.env.GARRY_GITHUB_API = `http://127.0.0.1:${(github.address() as AddressInfo).port}`;

const { githubName } = await import("./create-repo.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { addWorktree, commitAll, git } = await import("../threads/git.js");
const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const err = (p: Promise<unknown>) => p.then(() => null, (e: { status?: number; message?: string }) => e);

expect("GitHub gets the name as in Garry, with what it does not allow as dashes", githubName("My Shop!") === "My-Shop" && githubName("api.v2_x") === "api.v2_x" && githubName("...") === "repo" && githubName("ąę") === "repo");

/** A repository with one commit on main and no remote; GitHub's urls lead to the local bare ones. */
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
const manager = new ThreadManager(store);
const shopPath = newRepo("shop");
const shop = store.addProject(shopPath, "My Shop!");
const thread = (projectId: string, path: string, branch: string) => {
  const id = store.newId();
  const worktree = join(store.root, "worktrees", id);
  const baseSha = addWorktree(path, worktree, branch);
  git(worktree, ["config", "user.name", "t"]);
  git(worktree, ["config", "user.email", "t@t"]);
  writeFileSync(join(worktree, `${id}.txt`), "work\n");
  const at = new Date().toISOString();
  const t = store.save({ id, projectId, title: "work", status: "idle", branch, worktree, baseSha, sessionId: null, createdAt: at, updatedAt: at });
  t.commit = commitAll(worktree, "work");
  return store.save(t);
};

const a = thread(shop.id, shopPath, "garry/work-a");
const pv = await manager.pushPreview(a.id);
expect("not on GitHub: the preview proposes your account and the name as in Garry", pv.remote === null && pv.create?.owner === "octo" && pv.create?.name === "My-Shop" && pv.refused === null && pv.base === "main", JSON.stringify(pv));
const noYes = await err(manager.openPr(a.id, undefined, undefined, true));
expect("without a yes to creating it, nothing is made", !!noYes && made.length === 0);
const notConfirmed = await err(manager.openPr(a.id, undefined, undefined, false, { name: "My-Shop" }));
expect("asking first: a yes to the push too, before anything is made", notConfirmed?.status === 428 && made.length === 0);
await manager.openPr(a.id, undefined, undefined, true, { name: "My-Shop" });
const origin = git(shopPath, ["config", "--get", "remote.origin.url"]).trim();
expect("with both yeses: created, private, under your account", made.length === 1 && made[0].path === "/user/repos" && made[0].name === "My-Shop" && made[0].private === true, JSON.stringify(made));
expect("added as origin, with no token in the url", origin === "https://github.com/octo/My-Shop.git");
const remoteHas = (owner: string, name: string, branch: string) => git(join(remotes, owner, `${name}.git`), ["branch", "--list", branch]).trim() !== "";
expect("the base branch and the work are pushed, and the pull request goes into the base", remoteHas("octo", "My-Shop", "main") && remoteHas("octo", "My-Shop", "garry/work-a") && opened.at(-1)?.repo === "octo/My-Shop" && opened.at(-1)?.base === "main" && opened.at(-1)?.head === "garry/work-a", JSON.stringify(opened));
expect("the work's log says the repository was created", store.events(a.id).some((e) => e.type === "git" && e.action === "repo" && e.detail === "https://github.com/octo/My-Shop"));
const b = thread(shop.id, shopPath, "garry/work-b");
expect("once on GitHub there is nothing to create", (await manager.pushPreview(b.id)).create === null);

// a project that pushes without asking: the yes to creating it is still needed, and enough
const cartPath = newRepo("cart");
const cart = store.addProject(cartPath, "cart");
store.saveSettings(cart.id, { push: "allow" });
const d = thread(cart.id, cartPath, "garry/work-d");
const allowNoYes = await err(manager.openPr(d.id));
expect("allow: still nothing made without a yes to creating it", !!allowNoYes && !made.some((m) => m.name === "cart"));
await manager.openPr(d.id, undefined, undefined, false, { name: "cart" });
expect("allow: with it, created and the pull request opened", made.some((m) => m.name === "cart") && opened.at(-1)?.repo === "octo/cart");

// an origin that is not on GitHub is left alone
const elsewherePath = newRepo("elsewhere");
git(elsewherePath, ["remote", "add", "origin", "https://gitlab.example/team/elsewhere.git"]);
const elsewhere = store.addProject(elsewherePath, "elsewhere");
const c = thread(elsewhere.id, elsewherePath, "garry/work-c");
const pc = await manager.pushPreview(c.id);
expect("an origin elsewhere: no proposal, and the preview says why", pc.create === null && /not on GitHub/.test(pc.refused ?? ""), JSON.stringify(pc));
const keep = await err(manager.openPr(c.id, undefined, undefined, true, { name: "elsewhere" }));
expect("and it is never replaced", keep?.status === 409 && git(elsewherePath, ["config", "--get", "remote.origin.url"]).trim() === "https://gitlab.example/team/elsewhere.git");

// the server
const server = createGarryServer({ registry: join(home, "registry"), skills: join(home, "none"), routing: join(home, "none.json"), threads: manager }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const blogPath = newRepo("blog");
const blog = store.addProject(blogPath, "Blog");
const h = (await fetch(`${base}/api/projects/${blog.id}/github-repo`).then((r) => r.json())) as { remote: string | null; create: { owner: string; name: string } | null };
expect("GET: not on GitHub, and what Garry would create", h.remote === null && h.create?.owner === "octo" && h.create?.name === "Blog");
const before = made.length;
expect("a write from another site is refused", (await post(`/api/projects/${blog.id}/github-repo`, {}, { origin: "https://evil.example" })).status === 403 && made.length === before);
store.saveSettings(blog.id, { push: "never" });
expect("a project that never pushes gets no repository", (await post(`/api/projects/${blog.id}/github-repo`, {})).status === 403 && made.length === before);
store.saveSettings(blog.id, { push: "ask" });
const taken = await post(`/api/projects/${blog.id}/github-repo`, { name: "taken" });
expect("a name already taken is a 409 that says so", taken.status === 409 && /already exists/.test(((await taken.json()) as { error: string }).error) && !existsSync(join(remotes, "octo", "taken.git")));
expect("a bad name is a 400", (await post(`/api/projects/${blog.id}/github-repo`, { name: "a b/c" })).status === 400);
const org = await post(`/api/projects/${blog.id}/github-repo`, { owner: "acme", private: false });
const orgBody = (await org.json()) as { owner: string; name: string; pushed: string };
expect("POST creates it for an organization, public when asked, and pushes the branch", org.status === 200 && made.at(-1)?.path === "/orgs/acme/repos" && made.at(-1)?.private === false && orgBody.owner === "acme" && orgBody.pushed === "main" && remoteHas("acme", "Blog", "main"), JSON.stringify(orgBody));
expect("and then GET shows where it is", ((await fetch(`${base}/api/projects/${blog.id}/github-repo`).then((r) => r.json())) as { remote: string }).remote === "acme/Blog");
expect("a second create is a 409", (await post(`/api/projects/${blog.id}/github-repo`, {})).status === 409);
server.close();
github.close();

if (failed) {
  console.error(`${failed} create-repo check(s) failed`);
  process.exit(1);
}
console.log("creating repositories on GitHub behaves as expected");
