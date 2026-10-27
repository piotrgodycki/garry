/**
 * Threads end to end with a stand-in for Claude Code (testdata/fake-claude.mjs):
 * a project, a thread in its own worktree, the live events, a follow-up that
 * resumes the session, the diff, the commit, stopping a turn, and a phone
 * (paired device) starting work but not registering folders, and the worktree's
 * files read and edited by hand from this computer only.
 * Run with: pnpm -C garry-tool test:threads
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { ThreadManager } from "./manager.js";
import { ThreadStore, type ThreadEvent } from "./store.js";
import { createGarryServer } from "../server/server.js";
import { DeviceStore } from "../server/auth.js";
import { reachableAddresses } from "../server/pairing.js";

process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("./testdata/fake-claude.mjs", import.meta.url));
const home = mkdtempSync(join(tmpdir(), "garry-threads-"));
const repo = join(home, "repo");
const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
execFileSync("git", ["init", "-q", repo]);
writeFileSync(join(repo, "README.md"), "# demo\n");
sh(repo, "add", "-A");
sh(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");

let failed = 0;
const expect = (name: string, ok: boolean) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
};
const until = async (cond: () => boolean, ms = 10000) => {
  for (let t = 0; t < ms && !cond(); t += 50) await new Promise((r) => setTimeout(r, 50));
  return cond();
};

const threads = new ThreadManager(new ThreadStore(join(home, ".garry")));
const project = threads.store.addProject(repo);
expect("a git repository becomes a project, once", threads.store.addProject(repo).id === project.id);

const live: ThreadEvent[] = [];
const t = threads.create(project.id, "Add a NOTES file");
threads.subscribe(t.id, (e) => live.push(e));
expect("the thread works on its own branch", t.branch.startsWith("garry/add-a-notes-file-") && sh(t.worktree, "branch", "--show-current").trim() === t.branch);
expect("the first turn finishes", await until(() => threads.store.get(t.id)?.status === "idle" && !threads.isRunning(t.id)));
const events = threads.store.events(t.id);
expect("events: the prompt, the tool, its result, the answer, the end", ["user", "tool", "tool_result", "text", "turn_end"].every((k) => events.some((e) => e.type === k)));
expect("live listeners got the events too", live.some((e) => e.type === "turn_end"));
expect("the session is kept", threads.store.get(t.id)?.sessionId === "fake-session-1");
expect("the project's own checkout is untouched", !readFileSync(join(repo, "README.md"), "utf8").includes("NOTES"));

threads.send(t.id, "And a second line");
await until(() => !threads.isRunning(t.id));
expect("a follow-up resumes the same session", threads.store.events(t.id).some((e) => e.type === "text" && e.text === "resumed fake-session-1"));

const d = threads.diff(t.id);
expect("the diff shows the new file with both lines", d.files.some((f) => f.path === "NOTES.md" && f.status === "added" && f.additions === 2) && d.patch.includes("+And a second line"));
const committed = threads.commit(t.id, "Add NOTES");
expect("commit lands on the thread's branch", sh(t.worktree, "log", "-1", "--format=%s").trim() === "Add NOTES" && Boolean(committed.commit));
let refused = false;
try {
  threads.commit(t.id, "again");
} catch {
  refused = true;
}
expect("nothing left to commit is refused", refused);

const slow = threads.create(project.id, "SLOW task");
expect("a turn can be stopped", threads.stop(slow.id) && (await until(() => !threads.isRunning(slow.id))));
expect("a stopped turn is not a success", threads.store.get(slow.id)?.status === "error");
threads.remove(slow.id);
expect("discarding removes the worktree and branch", !sh(repo, "branch", "--list", slow.branch).trim());

// the same over HTTP, from this machine and from a paired phone
const remote = reachableAddresses()[0];
const devices = new DeviceStore(join(home, "devices.json"));
const server = createGarryServer({ registry: join(repo, "none"), skills: join(repo, "none"), routing: join(repo, "none"), hosts: remote ? [remote] : [], threads }, devices);
await new Promise<void>((r) => server.listen(0, "0.0.0.0", r));
const port = (server.address() as AddressInfo).port;
try {
  const listed = (await fetch(`http://127.0.0.1:${port}/api/threads`).then((r) => r.json())) as { threads: { id: string }[] };
  expect("GET /api/threads lists them", listed.threads.some((x) => x.id === t.id));

  // files: read and edit the worktree by hand, from this computer
  const base = `http://127.0.0.1:${port}/api/threads/${t.id}`;
  const tree = (await fetch(`${base}/files`).then((r) => r.json())) as { entries: { name: string; type: string }[] };
  expect("the worktree's files are listed, .git hidden", tree.entries.some((e) => e.name === "NOTES.md") && !tree.entries.some((e) => e.name === ".git"));
  const file = (await fetch(`${base}/file?path=NOTES.md`).then((r) => r.json())) as { content: string; sha: string };
  expect("a file is read with its sha", file.content.includes("And a second line") && file.sha.length === 40);
  const save = (body: unknown) => fetch(`${base}/file`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const saved = await save({ path: "NOTES.md", content: file.content + "By hand\n", sha: file.sha });
  expect("an edit is saved and shows in the diff", saved.status === 200 && threads.diff(t.id).patch.includes("+By hand"));
  expect("a stale edit is refused", (await save({ path: "NOTES.md", content: "x", sha: file.sha })).status === 409);
  expect("a new file can be created", (await save({ path: "docs/new.md", content: "hi\n" })).status === 200 && readFileSync(join(t.worktree, "docs/new.md"), "utf8") === "hi\n");
  expect("paths cannot leave the worktree", (await fetch(`${base}/file?path=../../etc/passwd`)).status === 400 && (await save({ path: "../escape.txt", content: "x" })).status === 400);
  expect(".git is off limits", (await fetch(`${base}/file?path=.git/config`)).status === 403 && (await save({ path: ".git/hooks/pre-commit", content: "x" })).status === 403);
  symlinkSync(home, join(t.worktree, "out"));
  expect("a symlink out of the worktree is refused", (await fetch(`${base}/files?path=out`)).status === 400 && (await save({ path: "out/x.txt", content: "x" })).status === 400);
  if (remote) {
    const { code } = devices.createCode();
    const { token } = (await fetch(`http://${remote}:${port}/api/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, name: "phone" }) }).then((r) => r.json())) as { token: string };
    const phone = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const started = await fetch(`http://${remote}:${port}/api/threads`, { method: "POST", headers: phone, body: JSON.stringify({ projectId: project.id, prompt: "From the phone" }) });
    expect("a paired phone starts a thread", started.status === 200);
    const addFolder = await fetch(`http://${remote}:${port}/api/projects`, { method: "POST", headers: phone, body: JSON.stringify({ path: "/" }) });
    expect("a phone cannot register folders", addFolder.status === 403);
    const phoneRead = await fetch(`http://${remote}:${port}/api/threads/${t.id}/file?path=NOTES.md`, { headers: phone });
    const phoneWrite = await fetch(`http://${remote}:${port}/api/threads/${t.id}/file`, { method: "POST", headers: phone, body: JSON.stringify({ path: "NOTES.md", content: "x" }) });
    expect("a phone can neither read nor edit files", phoneRead.status === 403 && phoneWrite.status === 403);
    const unpaired = await fetch(`http://${remote}:${port}/api/threads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: project.id, prompt: "x" }) });
    expect("an unpaired device cannot", unpaired.status === 401);
  } else console.log("no non-loopback address: phone cases skipped");
} finally {
  server.close();
}

console.log(failed ? `\n${failed} thread case(s) failed` : "\nthreads behave as expected");
process.exit(failed ? 1 : 0);
