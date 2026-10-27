/**
 * Regression test for what Garry may do with a project's remote: the settings
 * (checked, per project), branch names from the prefix, protected branches,
 * asking before a push, never pushing, and the server's endpoints. A stand-in
 * for GitHub's API and a local repository as the remote.
 * Run with: pnpm -C garry-tool test:push (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

const home = mkdtempSync(join(tmpdir(), "garry-push-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_GITHUB_TOKEN = "ghp_" + "a".repeat(36);

const opened: { head: string; base: string; draft: boolean }[] = [];
const github = createServer((req, res) => {
  const send = (code: number, body: unknown) => (res.writeHead(code, { "content-type": "application/json" }), res.end(JSON.stringify(body)));
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    if (req.method === "GET" && req.url === "/repos/octo/shop") return send(200, { default_branch: "main" });
    if (req.method === "POST" && req.url === "/repos/octo/shop/pulls") {
      const b = JSON.parse(raw) as { head: string; base: string; draft: boolean };
      opened.push(b);
      return send(201, { number: opened.length, html_url: `https://github.com/octo/shop/pull/${opened.length}` });
    }
    if (req.url?.includes("/labels")) return send(200, []);
    send(404, {});
  });
});
await new Promise<void>((r) => github.listen(0, "127.0.0.1", r));
process.env.GARRY_GITHUB_API = `http://127.0.0.1:${(github.address() as AddressInfo).port}`;

const { applySettings, DEFAULT_SETTINGS, isProtected, pushRefusal } = await import("./settings.js");
const { ThreadManager } = await import("./manager.js");
const { ThreadStore } = await import("./store.js");
const { addWorktree, commitAll, git } = await import("./git.js");
const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const throws = (f: () => unknown) => {
  try {
    f();
    return false;
  } catch {
    return true;
  }
};

// the rules
expect("asks before pushing by default", DEFAULT_SETTINGS.push === "ask");
expect("main and release/* are protected", isProtected("main", DEFAULT_SETTINGS.protectedBranches) && isProtected("release/1.2", DEFAULT_SETTINGS.protectedBranches) && !isProtected("garry/x-1", DEFAULT_SETTINGS.protectedBranches));
expect("a dot in a pattern is a dot", !isProtected("mainx", ["main"]) && !isProtected("v1x2", ["v1.2"]));
expect("bad settings are refused", throws(() => applySettings(DEFAULT_SETTINGS, { push: "yolo" })) && throws(() => applySettings(DEFAULT_SETTINGS, { branchPrefix: "../x" })) && throws(() => applySettings(DEFAULT_SETTINGS, { baseBranch: "a..b" })));
expect("a prefix that would be protected is refused", throws(() => applySettings(DEFAULT_SETTINGS, { branchPrefix: "release/" })));
expect("never pushing is never", pushRefusal({ ...DEFAULT_SETTINGS, push: "never" }, "garry/x", "main") !== null);
expect("never into the base branch", pushRefusal(DEFAULT_SETTINGS, "dev", "dev") !== null);

// a project whose origin is github.com/octo/shop, served from a local repository
const remotes = join(home, "remotes");
execFileSync("git", ["init", "-q", "--bare", "-b", "main", join(remotes, "octo", "shop.git")]);
const repo = join(home, "shop");
execFileSync("git", ["init", "-q", "-b", "main", repo]);
writeFileSync(join(repo, "README.md"), "# shop\n");
git(repo, ["add", "-A"]);
git(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
git(repo, ["remote", "add", "origin", "https://github.com/octo/shop.git"]);
git(repo, ["config", `url.file://${remotes}/.insteadOf`, "https://github.com/"]);
git(repo, ["push", "-q", "origin", "main"]);

const store = new ThreadStore(process.env.GARRY_HOME!);
const manager = new ThreadManager(store);
const project = store.addProject(repo);
expect("a new project gets the defaults", store.settings(project.id).push === "ask");

/** A thread with one commit, as if the agent had worked and the person committed. */
const thread = (branch: string) => {
  const id = store.newId();
  const worktree = join(store.root, "worktrees", id);
  const baseSha = addWorktree(repo, worktree, branch);
  git(worktree, ["config", "user.name", "t"]);
  git(worktree, ["config", "user.email", "t@t"]);
  writeFileSync(join(worktree, `${id}.txt`), "work\n");
  const at = new Date().toISOString();
  const t = store.save({ id, projectId: project.id, title: "work", status: "idle", branch, worktree, baseSha, sessionId: null, createdAt: at, updatedAt: at });
  t.commit = commitAll(worktree, "work");
  return store.save(t);
};
const remoteHas = (branch: string) => git(join(remotes, "octo", "shop.git"), ["branch", "--list", branch]).trim() !== "";

const a = thread("garry/work-a");
const preview = await manager.pushPreview(a.id);
expect("the preview shows the branch, the remote, the base and the commits", preview.branch === "garry/work-a" && preview.remote === "octo/shop" && preview.base === "main" && preview.commits.length === 1 && preview.commits[0].subject === "work" && preview.mode === "ask" && preview.refused === null);
const unconfirmed = await manager.openPr(a.id).then(() => null, (e: { status?: number }) => e);
expect("asking first: nothing is pushed without a yes", unconfirmed?.status === 428 && !remoteHas("garry/work-a"));
await manager.openPr(a.id, undefined, undefined, true);
expect("with a yes it is pushed and the PR opened", remoteHas("garry/work-a") && opened.at(-1)?.head === "garry/work-a" && opened.at(-1)?.base === "main" && opened.at(-1)?.draft === false);

store.saveSettings(project.id, { push: "allow", baseBranch: "develop", draftPr: true, protectedBranches: ["main"] });
git(repo, ["push", "-q", "origin", "main:develop"]);
const b = thread("garry/work-b");
await manager.openPr(b.id);
expect("allow: pushed without asking, into the chosen base, as a draft", remoteHas("garry/work-b") && opened.at(-1)?.base === "develop" && opened.at(-1)?.draft === true);

store.saveSettings(project.id, { protectedBranches: ["main", "hotfix/*"] });
const c = thread("hotfix/urgent");
const prot = await manager.openPr(c.id, undefined, undefined, true).then(() => null, (e: { status?: number }) => e);
expect("a protected branch is never pushed, even with a yes", prot?.status === 403 && !remoteHas("hotfix/urgent"));

store.saveSettings(project.id, { push: "never" });
const d = thread("garry/work-d");
const never = await manager.openPr(d.id, undefined, undefined, true).then(() => null, (e: { status?: number }) => e);
expect("never: nothing leaves this computer", never?.status === 403 && !remoteHas("garry/work-d"));

store.saveSettings(project.id, { push: "ask", branchPrefix: "team/garry-" });
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("./testdata/fake-claude.mjs", import.meta.url));
const started = manager.create(project.id, "add a footer");
expect("new branches use the prefix", started.branch.startsWith("team/garry-add-a-footer-"), started.branch);
manager.stop(started.id);

// the server
const server = createGarryServer({ registry: join(home, "registry"), skills: join(home, "none"), routing: join(home, "none.json"), threads: manager }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const got = (await fetch(`${base}/api/projects/${project.id}/settings`).then((r) => r.json())) as { push: string; branchPrefix: string };
expect("GET settings", got.push === "ask" && got.branchPrefix === "team/garry-");
const saved = await post(`/api/projects/${project.id}/settings`, { push: "allow" });
expect("POST settings saves", saved.status === 200 && store.settings(project.id).push === "allow");
expect("bad settings are a 400", (await post(`/api/projects/${project.id}/settings`, { push: "yolo" })).status === 400);
expect("a write from another site is refused", (await post(`/api/projects/${project.id}/settings`, { push: "never" }, { origin: "https://evil.example" })).status === 403 && store.settings(project.id).push === "allow");
store.saveSettings(project.id, { push: "ask" });
const e = thread("garry/work-e");
const pv = (await fetch(`${base}/api/threads/${e.id}/push`).then((r) => r.json())) as { branch: string; mode: string };
expect("GET /api/threads/:id/push previews", pv.branch === "garry/work-e" && pv.mode === "ask");
expect("POST /pr without a yes is a 428", (await post(`/api/threads/${e.id}/pr`, {})).status === 428 && !remoteHas("garry/work-e"));
expect("POST /pr with a yes pushes", (await post(`/api/threads/${e.id}/pr`, { confirmed: true })).status === 200 && remoteHas("garry/work-e"));
server.close();
github.close();

if (failed) {
  console.error(`${failed} push check(s) failed`);
  process.exit(1);
}
console.log("push settings behave as expected");
