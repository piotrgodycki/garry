/**
 * Regression test for Garry projects: the default one (the registry Garry
 * always used), creating and switching (the registry follows), repositories
 * per project, export to one file (registry files only, no credentials) and
 * import (never writing outside the new project's registry), removing (any
 * one, the default and the active too, never the last nor one with agents at
 * work; repositories stay on disk), and the server's endpoints. Run with: pnpm -C garry-tool test:project (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-proj-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_NO_GH = "1";
process.env.GARRY_CLAUDE_BIN = new URL("../threads/testdata/fake-claude.mjs", import.meta.url).pathname;
delete process.env.GARRY_GITHUB_TOKEN;
const cwd = mkdtempSync(join(tmpdir(), "garry-cwd-"));
process.chdir(cwd);

const { activeGarryProject, createGarryProject, listGarryProjects, removeGarryProject, useGarryProject } = await import("./store.js");
const { bundlePathOk, cleanRemote, exportGarryProject, importGarryProject } = await import("./bundle.js");
const { defaultRegistry } = await import("../paths.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");
const { reachableAddresses } = await import("../server/pairing.js");
const { projectOwner } = await import("./avatar.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const status = (f: () => unknown) => {
  try {
    f();
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? -1;
  }
};

// the default project is the registry Garry always used
expect("a fresh install has the default project", listGarryProjects().active === "default" && defaultRegistry() === join(process.env.GARRY_HOME!, "registry"));

const shop = createGarryProject({ name: "Shop", description: "the web shop" });
expect("a new project has its own registry", existsSync(join(shop.path, "catalog")) && shop.path.startsWith(join(process.env.GARRY_HOME!, "garry-projects")));
expect("a name is required", status(() => createGarryProject({ name: "  " })) === 400);
useGarryProject(shop.id);
expect("switching moves the registry", activeGarryProject().id === shop.id && defaultRegistry() === shop.path);
expect("removing a project that is not there is a 404", status(() => removeGarryProject("nope")) === 404);

// export: registry files only, remotes without credentials
mkdirSync(join(shop.path, "stacks"), { recursive: true });
writeFileSync(join(shop.path, "catalog", "web.yaml"), "name: web\nkind: mfe-remote\nrepo: x\n");
writeFileSync(join(shop.path, "architecture.json"), '{"nodes":[],"edges":[]}\n');
writeFileSync(join(shop.path, ".env"), "SECRET=1\n");
writeFileSync(join(shop.path, "notes.txt"), "not part of a registry\n");
const bundle = exportGarryProject(shop.id, [{ name: "web", remote: "https://me:ghp_secret@github.com/acme/web.git" }]);
expect("export carries the registry", bundle.files["catalog/web.yaml"]?.includes("kind: mfe-remote") && "architecture.json" in bundle.files);
expect("and nothing else", !(".env" in bundle.files) && !("notes.txt" in bundle.files));
expect("remotes lose their credentials", bundle.repos[0].remote === "https://github.com/acme/web.git" && !JSON.stringify(bundle).includes("ghp_secret"));
expect("cleanRemote keeps ssh remotes", cleanRemote("git@github.com:acme/web.git") === "git@github.com:acme/web.git");

// import: a new project, never writing outside it
const imported = importGarryProject(bundle);
expect("import makes a new project with a free name", imported.name === "Shop (2)" && readFileSync(join(imported.path, "catalog", "web.yaml"), "utf8").includes("web") && imported.pendingRepos?.[0]?.name === "web");
for (const bad of ["../escape.yaml", "catalog/../../x", "/etc/passwd", "catalog/.git/config", ".env", "secrets/x", "catalog//x"]) {
  expect(`refuses ${bad}`, !bundlePathOk(bad) && status(() => importGarryProject({ ...bundle, files: { [bad]: "x" } })) === 400);
}
expect("refuses what is not a Garry project", status(() => importGarryProject({ hello: 1 })) === 400 && status(() => importGarryProject({ ...bundle, version: 99 })) === 400);
expect("nothing escaped", !existsSync(join(process.env.GARRY_HOME!, "garry-projects", "escape.yaml")) && !existsSync(join(home, "x")));

// repositories belong to a project
const repo = join(home, "web");
execFileSync("git", ["init", "-q", repo]);
writeFileSync(join(repo, "README.md"), "# web\n");
execFileSync("git", ["-C", repo, "add", "-A"]);
execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
const store = new ThreadStore(process.env.GARRY_HOME!);
const webRepo = store.addProject(repo, "web", shop.id);
const at = new Date().toISOString();
store.save({ id: "thrshop1", projectId: webRepo.id, title: "shop work", status: "idle", branch: "garry/x", worktree: repo, baseSha: "", sessionId: null, createdAt: at, updatedAt: at });
expect("a repository belongs to one project", store.projectsOf(shop.id).length === 1 && store.projectsOf("default").length === 0);

// the server
useGarryProject("default");
const remote = reachableAddresses()[0];
const devices = new DeviceStore(join(home, "devices.json"));
const cfg = { registry: defaultRegistry(), skills: join(home, "none"), routing: join(home, "none.json"), threads: new ThreadManager(store), hosts: remote ? [remote] : [] };
const server = createGarryServer(cfg, devices);
await new Promise<void>((r) => server.listen(0, "0.0.0.0", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const list = (await fetch(`${base}/api/garry-projects`).then((r) => r.json())) as { active: string; projects: { id: string; repos: unknown[] }[] };
expect("GET /api/garry-projects lists them with their repositories", list.active === "default" && list.projects.find((p) => p.id === shop.id)?.repos.length === 1);
expect("the default project shows none of the shop's repositories", ((await fetch(`${base}/api/projects`).then((r) => r.json())) as { projects: unknown[] }).projects.length === 0);
expect("nor its work", ((await fetch(`${base}/api/threads`).then((r) => r.json())) as { threads: { id: string }[] }).threads.every((t) => t.id !== "thrshop1"));
expect("POST /api/garry-projects/active switches", (await post("/api/garry-projects/active", { id: shop.id })).status === 200 && cfg.registry === shop.path);
const services = (await fetch(`${base}/api/registry`).then((r) => r.json())) as { services: { name: string }[] };
expect("and the registry follows", services.services.some((s) => s.name === "web"));
expect("the shop's repositories show", ((await fetch(`${base}/api/projects`).then((r) => r.json())) as { projects: unknown[] }).projects.length === 1);
expect("and its work", ((await fetch(`${base}/api/threads`).then((r) => r.json())) as { threads: { id: string }[] }).threads.some((t) => t.id === "thrshop1"));
const exported = await fetch(`${base}/api/garry-projects/${shop.id}/export`);
expect("GET .../export downloads the file", exported.status === 200 && (exported.headers.get("content-disposition") ?? "").includes(".garry.json"));
const viaApi = await post("/api/garry-projects/import", await exported.json());
expect("POST /api/garry-projects/import imports it", viaApi.status === 200);
expect("cloning needs GitHub", (await post(`/api/garry-projects/${imported.id}/repos/clone`, { remote: "https://github.com/acme/web.git" })).status === 400);
expect("a write from another site is refused", (await post("/api/garry-projects", { name: "evil" }, { origin: "https://evil.example" })).status === 403);
// a paired phone sees the projects but cannot change them
if (remote) {
  const port = (server.address() as AddressInfo).port;
  const { code } = devices.createCode();
  const { token } = (await fetch(`http://${remote}:${port}/api/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, name: "phone" }) }).then((r) => r.json())) as { token: string };
  const phone = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  expect("a phone sees the projects", (await fetch(`http://${remote}:${port}/api/garry-projects`, { headers: phone })).status === 200);
  const tries = [
    await fetch(`http://${remote}:${port}/api/garry-projects`, { method: "POST", headers: phone, body: JSON.stringify({ name: "from phone" }) }),
    await fetch(`http://${remote}:${port}/api/garry-projects/active`, { method: "POST", headers: phone, body: JSON.stringify({ id: "default" }) }),
    await fetch(`http://${remote}:${port}/api/garry-projects/${shop.id}/export`, { headers: phone }),
    await fetch(`http://${remote}:${port}/api/garry-projects/import`, { method: "POST", headers: phone, body: JSON.stringify(bundle) }),
  ];
  expect("but cannot make, switch, export or import", tries.every((r) => r.status === 403) && cfg.registry === shop.path, tries.map((r) => r.status).join());
  expect("a phone cannot remove a project", (await fetch(`http://${remote}:${port}/api/garry-projects/${imported.id}`, { method: "DELETE", headers: phone })).status === 403 && listGarryProjects().projects.some((p) => p.id === imported.id));
} else console.log("skip phone checks: no network address to pair from");

// removing: an agent at work in it keeps it
const del = (id: string) => fetch(`${base}/api/garry-projects/${id}`, { method: "DELETE" });
const working = cfg.threads.create(webRepo.id, "BUSY change the shop");
const until = async (f: () => boolean) => {
  for (let i = 0; i < 200 && !f(); i++) await new Promise((r) => setTimeout(r, 50));
  return f();
};
await until(() => store.events(working.id).some((e) => e.type === "tool"));
const refusedBusy = await del(shop.id);
expect("a project with an agent at work is not removed", refusedBusy.status === 409 && ((await refusedBusy.json()) as { error: string }).error.includes("stop it first") && existsSync(shop.path));
cfg.threads.stop(working.id);
await until(() => !cfg.threads.isRunning(working.id));

// the active one goes: the default takes over, its repositories leave Build and stay on disk
expect("the active project is shop", listGarryProjects().active === shop.id);
const gone = await del(shop.id);
const after = (await gone.json()) as { active: string; projects: { id: string }[] };
expect("removing the active project makes the default active", gone.status === 200 && after.active === "default" && cfg.registry === defaultRegistry() && !after.projects.some((p) => p.id === shop.id));
expect("its registry folder is gone", !existsSync(shop.path));
expect("its repositories leave Build but stay on disk", store.projectsOf(shop.id).length === 0 && existsSync(join(repo, ".git")) && ((await fetch(`${base}/api/projects`).then((r) => r.json())) as { projects: unknown[] }).projects.length === 0);

// the default one goes too while another is left
const otherDefaultFile = join(defaultRegistry(), "catalog", "old.yaml");
writeFileSync(otherDefaultFile, "name: old\n");
const noDefault = await del("default");
const left = (await noDefault.json()) as { active: string; projects: { id: string }[] };
expect("the default project can be removed while another is left", noDefault.status === 200 && !left.projects.some((p) => p.id === "default") && left.active === left.projects[0]?.id && !existsSync(otherDefaultFile));
expect("and stays removed: Garry does not bring it back", !listGarryProjects().projects.some((p) => p.id === "default") && activeGarryProject().id === left.active);
// down to one: that one stays
for (const p of left.projects.slice(1)) await del(p.id);
const last = await del(listGarryProjects().projects[0].id);
const lastError = ((await last.json()) as { error: string }).error;
expect("the last project stays, and Garry says why", last.status === 400 && lastError.includes("make another one first") && listGarryProjects().projects.length === 1, `${last.status} ${lastError}`);
server.close();

// a project's mark: the GitHub owner most of its repositories live under
expect("repositories still to clone count by their remote; others are not GitHub", projectOwner([], ["https://github.com/solo/x", "https://gitlab.example/other/y", "https://gitlab.example/other/z", "https://github.com/acme/web.git", "git@github.com:acme/api.git"]) === "acme");
expect("no repository on GitHub: no owner", projectOwner([], ["https://gitlab.example/a/b"]) === null);
process.env.GARRY_GITHUB_AVATARS = "off";
expect("a company can keep names off github.com requests", projectOwner([], ["https://github.com/acme/web.git"]) === null);
delete process.env.GARRY_GITHUB_AVATARS;

if (failed) {
  console.error(`${failed} project check(s) failed`);
  process.exit(1);
}
console.log("Garry projects behave as expected");
