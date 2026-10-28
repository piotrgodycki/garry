/**
 * Regression test for notifications on the phone: a paired phone registers
 * its push token over HTTP (and only its own, and only a real one), real
 * threads run by a stand-in for Claude Code end the way they do, and a
 * stand-in for Expo's push service records what Garry sends: the title and
 * detail by default, nothing named with GARRY_PUSH_DETAIL=minimal, nothing at
 * all with GARRY_PUSH=off or once the phone opts out.
 * Run with: pnpm -C garry-tool test:push-notify (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const home = mkdtempSync(join(tmpdir(), "garry-pushn-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../threads/testdata/fake-claude.mjs", import.meta.url));

// the stand-in for Expo's push service
const received: { to: string; title: string; body: string; data: { threadId: string; state: string }; sound?: string }[] = [];
const expo = createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    received.push(...JSON.parse(raw));
    res.writeHead(200, { "content-type": "application/json" }).end('{"data":[]}');
  });
});
await new Promise<void>((r) => expo.listen(0, "127.0.0.1", r));
process.env.GARRY_PUSH_URL = `http://127.0.0.1:${(expo.address() as AddressInfo).port}/push`;

const { startPushNotifier } = await import("./push.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { DeviceStore } = await import("../server/auth.js");
const { createGarryServer } = await import("../server/server.js");
const { reachableAddresses } = await import("../server/pairing.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const until = async (f: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return f();
};
const settle = () => new Promise((r) => setTimeout(r, 700));

const repo = join(home, "repo");
execFileSync("git", ["init", "-q", repo]);
writeFileSync(join(repo, "README.md"), "# demo\n");
execFileSync("git", ["-C", repo, "add", "-A"]);
execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);

const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const project = threads.store.addProject(repo);
const devices = new DeviceStore(join(home, "devices.json"));
const stop = startPushNotifier(threads, devices);

// a phone pairs; a second one pairs but never asks for notifications
const phone = devices.pair(devices.createCode().code, "phone") as { device: { id: string }; token: string };
devices.pair(devices.createCode().code, "tablet");
const TOKEN = "ExponentPushToken[abcdefgh12345678]";

const remote = reachableAddresses()[0];
const server = createGarryServer({ registry: join(home, "reg"), skills: join(home, "none"), routing: join(home, "none.json"), threads, hosts: remote ? [remote] : [] }, devices);
await new Promise<void>((r) => server.listen(0, "0.0.0.0", r));
const port = (server.address() as AddressInfo).port;
if (remote) {
  const post = (body: unknown, auth = phone.token) =>
    fetch(`http://${remote}:${port}/api/push/token`, { method: "POST", headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  expect("a made-up token is refused", (await post({ token: "please-send-here" })).status === 400 && !devices.list().find((d) => d.id === phone.device.id)?.pushToken);
  expect("an unpaired device cannot register", (await post({ token: TOKEN }, "not-a-device-token")).status === 401);
  expect("the phone registers its own token", (await post({ token: TOKEN })).status === 200 && devices.list().find((d) => d.id === phone.device.id)?.pushToken === TOKEN);
} else {
  console.log("skip HTTP registration: no network address to pair from");
  devices.setPushToken(phone.device.id, TOKEN);
}
expect("this computer has no push token to register", (await fetch(`http://127.0.0.1:${port}/api/push/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: TOKEN }) })).status === 400);

// work that ends with a question reaches the phone, named
const asks = threads.create(project.id, "add a button ASK", "Add a buy button");
await until(() => !threads.isRunning(asks.id));
await until(() => received.length > 0);
expect("a question is pushed to the phone that asked, once", received.length === 1 && received[0].to === TOKEN, JSON.stringify(received));
expect("it says what needs you, with a sound", received[0]?.title === "Garry needs you: Add a buy button" && received[0].body.includes("red or blue") && received[0].sound === "default" && received[0].data.threadId === asks.id);

// minimal: nothing named leaves the computer
process.env.GARRY_PUSH_DETAIL = "minimal";
const quiet = threads.create(project.id, "write the notes", "Secret project notes");
await until(() => !threads.isRunning(quiet.id));
await until(() => received.length > 1);
expect("minimal detail sends no names", received.length === 2 && received[1].title === "Work is ready for review" && !JSON.stringify(received[1]).includes("Secret"), JSON.stringify(received[1]));
delete process.env.GARRY_PUSH_DETAIL;

// off: nothing at all
process.env.GARRY_PUSH = "off";
const offRun = threads.create(project.id, "more notes", "Another one");
await until(() => !threads.isRunning(offRun.id));
await settle();
expect("GARRY_PUSH=off sends nothing", received.length === 2);
delete process.env.GARRY_PUSH;

// the phone opts out: nothing either
devices.setPushToken(phone.device.id, null);
const after = threads.create(project.id, "even more", "After opting out");
await until(() => !threads.isRunning(after.id));
await settle();
expect("after opting out nothing is sent", received.length === 2);

stop();
server.close();
expo.close();
if (failed) {
  console.error(`${failed} notification check(s) failed`);
  process.exit(1);
}
console.log("phone notifications behave as expected");
process.exit(0);
