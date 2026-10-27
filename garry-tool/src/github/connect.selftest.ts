/**
 * Regression test for connecting GitHub and importing repositories, against a
 * stand-in for GitHub: the token order, saving a token (owner only), the device
 * flow, listing repositories, cloning without writing the token into the repo,
 * and the server's endpoints. Run with: pnpm -C garry-tool test:github (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-gh-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
delete process.env.GARRY_GITHUB_TOKEN;
const TOKEN = "ghp_" + "a".repeat(36);

let polls = 0;
const github = createServer((req, res) => {
  const send = (code: number, body: unknown) => (res.writeHead(code, { "content-type": "application/json" }), res.end(JSON.stringify(body)));
  const authed = req.headers.authorization === `Bearer ${TOKEN}`;
  if (req.url === "/user") return authed ? send(200, { login: "octo" }) : send(401, { message: "Bad credentials" });
  if (req.url?.startsWith("/user/repos")) return authed ? send(200, [{ full_name: "octo/shop", description: "The shop", private: true, default_branch: "main", updated_at: "2026-10-01T00:00:00Z", clone_url: "x" }, { full_name: "octo/blog", description: null, private: false, default_branch: "main", updated_at: "2026-09-01T00:00:00Z", clone_url: "y" }]) : send(401, {});
  if (req.url === "/login/device/code") return send(200, { device_code: "dev-1", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", interval: 0, expires_in: 60 });
  if (req.url === "/login/oauth/access_token") return send(200, ++polls < 2 ? { error: "authorization_pending" } : { access_token: TOKEN });
  send(404, {});
});
await new Promise<void>((r) => github.listen(0, "127.0.0.1", r));
const ghUrl = `http://127.0.0.1:${(github.address() as AddressInfo).port}`;
process.env.GARRY_GITHUB_API = ghUrl;
process.env.GARRY_GITHUB_WEB = ghUrl;

const { forgetToken, githubStatus, listRepos, pollDeviceFlow, saveToken, startDeviceFlow, tokenWithSource, cloneRepo } = await import("./connect.js");
const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const rejects = async (p: Promise<unknown>) => p.then(() => false, () => true);

expect("not connected at first", !(await githubStatus()).connected && !tokenWithSource());
expect("a token GitHub refuses is not saved", (await rejects(saveToken("ghp_" + "b".repeat(36)))) && !existsSync(join(process.env.GARRY_HOME!, "github.json")));
expect("junk is not a token", await rejects(saveToken("hello world")));
expect("a good token is saved", (await saveToken(TOKEN)).login === "octo");
const file = join(process.env.GARRY_HOME!, "github.json");
expect("only the owner can read it", (statSync(file).mode & 0o077) === 0);
expect("Garry's token is used", tokenWithSource()?.source === "garry" && (await githubStatus()).login === "octo");
process.env.GARRY_GITHUB_TOKEN = "ghp_" + "c".repeat(36);
expect("GARRY_GITHUB_TOKEN wins", tokenWithSource()?.source === "env");
delete process.env.GARRY_GITHUB_TOKEN;

forgetToken();
expect("logout forgets it", !tokenWithSource());
expect("the device flow needs a client id", await rejects(startDeviceFlow()));
process.env.GARRY_GITHUB_CLIENT_ID = "Iv1.test";
const d = await startDeviceFlow();
expect("the device flow gives a code to enter", d.userCode === "ABCD-1234");
expect("pending until it is entered", (await pollDeviceFlow(d.deviceCode)).status === "pending");
const done = await pollDeviceFlow(d.deviceCode);
expect("then the token is saved", done.status === "done" && done.login === "octo" && tokenWithSource()?.source === "garry");

const repos = await listRepos(TOKEN, "sh");
expect("repositories are listed and filtered", repos.length === 1 && repos[0].fullName === "octo/shop" && repos[0].private);

// cloning: a local repository stands in for github.com
const remotes = join(home, "remotes");
mkdirSync(join(remotes, "octo"), { recursive: true });
const src = join(home, "src");
execFileSync("git", ["init", "-q", src]);
writeFileSync(join(src, "README.md"), "# shop\n");
execFileSync("git", ["-C", src, "add", "-A"]);
execFileSync("git", ["-C", src, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
execFileSync("git", ["clone", "-q", "--bare", src, join(remotes, "octo", "shop.git")]);
process.env.GARRY_GITHUB_WEB = `file://${remotes}`;
expect("bad names are refused", (() => {
  try {
    cloneRepo(TOKEN, "../etc");
    return false;
  } catch {
    return true;
  }
})());
const dir = cloneRepo(TOKEN, "octo/shop");
expect("a repository is cloned into ~/.garry/repos", dir === join(process.env.GARRY_HOME!, "repos", "octo", "shop") && existsSync(join(dir, "README.md")));
expect("the token is not written into the clone", !readFileSync(join(dir, ".git", "config"), "utf8").includes(TOKEN) && !readFileSync(join(dir, ".git", "config"), "utf8").toLowerCase().includes("authorization"));
expect("importing again reuses it", cloneRepo(TOKEN, "octo/shop") === dir);

// the server (this computer)
process.env.GARRY_GITHUB_WEB = ghUrl;
const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const server = createGarryServer({ registry: join(home, "registry"), skills: join(home, "none"), routing: join(home, "none.json"), threads }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const status = (await fetch(`${base}/api/github`).then((r) => r.json())) as { connected: boolean; login: string; deviceFlow: boolean };
expect("GET /api/github says who is connected", status.connected && status.login === "octo" && status.deviceFlow);
const listed = (await fetch(`${base}/api/github/repos?q=blog`).then((r) => r.json())) as { repos: { fullName: string }[] };
expect("GET /api/github/repos lists them", listed.repos.length === 1 && listed.repos[0].fullName === "octo/blog");
process.env.GARRY_GITHUB_WEB = `file://${remotes}`;
const imported = await fetch(`${base}/api/projects/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repo: "octo/shop" }) });
const project = (await imported.json()) as { name: string; path: string };
expect("POST /api/projects/import adds it as a project", imported.status === 200 && project.name === "shop" && threads.store.projects().some((p) => p.path === dir));
const cross = await fetch(`${base}/api/github/token`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ token: TOKEN }) });
expect("a write from another site is refused", cross.status === 403);
server.close();
github.close();

if (failed) {
  console.error(`${failed} GitHub check(s) failed`);
  process.exit(1);
}
console.log("GitHub checks passed");
