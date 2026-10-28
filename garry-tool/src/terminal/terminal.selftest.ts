/**
 * Regression test for the Files tab's terminal: a real shell in a real
 * terminal, driven over HTTP the way the dashboard does. It opens in the folder
 * asked for, runs what is typed, stops a running command on Ctrl-C, resizes,
 * replays its output to a view that attaches late, and ends when closed. Only
 * this computer may open one: a paired device, another site and an unknown
 * folder are refused, and GARRY_TERMINAL=off turns it off.
 * Run with: pnpm -C garry-tool test:terminal (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-term-test-"));
process.env.GARRY_HOME = join(home, ".garry");

const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { DeviceStore } = await import("../server/auth.js");
const { createGarryServer } = await import("../server/server.js");
const { reachableAddresses } = await import("../server/pairing.js");
const { MAX_TERMINALS, TerminalManager } = await import("./terminal.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};

const repo = realpathSync(mkdtempSync(join(home, "repo-")));
execFileSync("git", ["init", "-q", repo]);
writeFileSync(join(repo, "hello.txt"), "from the repo\n");
const registry = join(home, "registry");

const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const project = threads.store.addProject(repo);
const devices = new DeviceStore(join(home, "devices.json"));
const phone = devices.pair(devices.createCode().code, "phone") as { token: string };
const remote = reachableAddresses()[0];
const terminals = new TerminalManager();
const server = createGarryServer({ registry, skills: join(home, "none"), routing: join(home, "none.json"), threads, terminals, hosts: remote ? [remote] : [] }, devices);
await new Promise<void>((r) => server.listen(0, "0.0.0.0", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

/** Follows a terminal's stream; `seen` grows as the shell prints. */
function follow(id: string) {
  const out = { seen: "", exited: false, abort: new AbortController() };
  void (async () => {
    try {
      const res = await fetch(`${base}/api/terminals/${id}/stream`, { signal: out.abort.signal });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (block.startsWith("event: exit")) out.exited = true;
          else if (block.startsWith("data: ")) out.seen += JSON.parse(block.slice(6));
        }
      }
    } catch {
      /* aborted */
    }
  })();
  return out;
}
const until = async (f: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return f();
};
const type = (id: string, data: string) => post(`/api/terminals/${id}/input`, { data });

// a shell in the repo, at the size asked for
const opened = await post("/api/terminals", { root: `project:${project.id}`, cols: 91, rows: 27 });
const term = (await opened.json()) as { id: string; cwd: string };
expect("a terminal opens in a repo", opened.status === 200 && term.cwd === repo, JSON.stringify(term));
const view = follow(term.id);
await type(term.id, "pwd; cat hello.txt; echo sum=$((40+2)); stty size\n");
expect("it runs in the repo's folder", await until(() => view.seen.includes(repo)), view.seen.slice(-400));
expect("what is typed runs", await until(() => view.seen.includes("from the repo") && view.seen.includes("sum=42")));
expect("it is a real terminal of the size asked for", await until(() => view.seen.includes("27 91")), view.seen.slice(-300));

// Ctrl-C stops a running command and the shell carries on
await type(term.id, "sleep 30; echo slept-$((6*7))\n");
await new Promise((r) => setTimeout(r, 400));
await type(term.id, "\x03");
await type(term.id, "echo after-interrupt\n");
expect("Ctrl-C stops a running command", await until(() => view.seen.includes("after-interrupt"), 5000) && !view.seen.includes("slept-42"), JSON.stringify(view.seen.slice(-400)));

// resizing reaches the shell
expect("resize is accepted", (await post(`/api/terminals/${term.id}/resize`, { cols: 132, rows: 40 })).status === 200);
await type(term.id, "stty size\n");
expect("the shell sees the new size", await until(() => view.seen.includes("40 132")), view.seen.slice(-300));

// a view that attaches late sees what came before
const late = follow(term.id);
expect("a late view replays the output so far", await until(() => late.seen.includes("sum=42")));
late.abort.abort();

// the shell's own process, to check it really ends
await type(term.id, "echo shell-pid=$$\n");
await until(() => /shell-pid=(\d+)/.test(view.seen.replace(/echo shell-pid=\$\$/g, "")));
const shellPid = Number(/shell-pid=(\d+)/.exec(view.seen.replace(/echo shell-pid=\$\$/g, ""))?.[1]);
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// listed, then closed: the shell ends
const listed = (await (await fetch(`${base}/api/terminals`)).json()) as { enabled: boolean; terminals: { id: string; root: string }[] };
expect("open terminals are listed", listed.enabled && listed.terminals.some((t) => t.id === term.id && t.root === `project:${project.id}`));
const closedAt = Date.now();
expect("closing it is accepted", (await fetch(`${base}/api/terminals/${term.id}`, { method: "DELETE" })).status === 200);
expect("closing ends the shell at once", (await until(() => view.exited)) && Date.now() - closedAt < 1000, `${Date.now() - closedAt} ms`);
expect("the shell's process is gone, not left behind", shellPid > 1 && (await until(() => !alive(shellPid), 3000)), `pid ${shellPid}`);
expect("typing into a closed terminal is refused", (await type(term.id, "echo nope\n")).status === 404);

// the registry is a root too
const reg = (await (await post("/api/terminals", { root: "registry" })).json()) as { id: string; cwd: string };
expect("a terminal opens in the registry", reg.cwd === registry);
await fetch(`${base}/api/terminals/${reg.id}`, { method: "DELETE" });

// refusals
expect("an unknown folder is refused", (await post("/api/terminals", { root: "project:zzzzzz" })).status === 404 && (await post("/api/terminals", { root: "/etc" })).status === 404);
expect("another site cannot open one", (await post("/api/terminals", { root: "registry" }, { origin: "https://evil.example" })).status === 403);
if (remote) {
  const remoteBase = `http://${remote}:${(server.address() as AddressInfo).port}`;
  const asPhone = await fetch(`${remoteBase}/api/terminals`, { method: "POST", headers: { authorization: `Bearer ${phone.token}`, "content-type": "application/json" }, body: JSON.stringify({ root: "registry" }) });
  const phoneList = await fetch(`${remoteBase}/api/terminals`, { headers: { authorization: `Bearer ${phone.token}` } });
  expect("a paired phone cannot open or see one", asPhone.status === 403 && phoneList.status === 403);
} else console.log("skip the phone check: no network address to pair from");
const big = (await (await post("/api/terminals", { root: "registry" })).json()) as { id: string };
expect("a huge paste is refused", (await type(big.id, "x".repeat(70_000))).status === 413);
await fetch(`${base}/api/terminals/${big.id}`, { method: "DELETE" });

// a limit on how many are open
const many: string[] = [];
for (let i = 0; i < MAX_TERMINALS; i++) many.push(((await (await post("/api/terminals", { root: "registry" })).json()) as { id: string }).id);
expect(`more than ${MAX_TERMINALS} at once is refused`, many.every(Boolean) && (await post("/api/terminals", { root: "registry" })).status === 429);
for (const id of many) await fetch(`${base}/api/terminals/${id}`, { method: "DELETE" });
const leftovers = () => {
  try {
    return execFileSync("pgrep", ["-f", "garry-term-[A-Za-z0-9]{6}/tty"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
expect("closed terminals leave no processes behind", await until(() => leftovers() === "", 3000), leftovers());

// a company can turn it off
process.env.GARRY_TERMINAL = "off";
const off = await post("/api/terminals", { root: "registry" });
expect("GARRY_TERMINAL=off refuses", off.status === 403 && ((await off.json()) as { error: string }).error.includes("GARRY_TERMINAL=off"));
delete process.env.GARRY_TERMINAL;

// stopping the server ends every shell
const last = (await (await post("/api/terminals", { root: "registry" })).json()) as { id: string };
let lastExited = false;
terminals.attach(last.id, (e) => e.type === "exit" && (lastExited = true));
server.close();
server.closeAllConnections();
expect("stopping the server ends its shells", (await until(() => lastExited)) && terminals.list().length === 0 && (await until(() => leftovers() === "", 3000)), leftovers());

if (failed) {
  console.error(`${failed} terminal check(s) failed`);
  process.exit(1);
}
console.log("the terminal behaves as expected");
process.exit(0);
