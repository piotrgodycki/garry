/**
 * Runs the client against a real garry server: reads, the live stream, pairing
 * from another address and a revoked token. Run with: pnpm -C garry-client test
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createGarryServer } from "../../garry-tool/src/server/server.js";
import { DeviceStore, pairingLink } from "../../garry-tool/src/server/auth.js";
import { reachableAddresses } from "../../garry-tool/src/server/pairing.js";
import { GarryClient, GarryError, pair, parsePairingLink, type StreamEvent, type ThreadEvent } from "./index";
import { ThreadManager } from "../../garry-tool/src/threads/manager.js";
import { ThreadStore } from "../../garry-tool/src/threads/store.js";

const repo = new URL("../../", import.meta.url).pathname;
const scratch = mkdtempSync(join(tmpdir(), "garry-client-"));
const store = new DeviceStore(join(scratch, "devices.json"));
process.env.GARRY_CLAUDE_BIN = new URL("../../garry-tool/src/threads/testdata/fake-claude.mjs", import.meta.url).pathname;
const threadManager = new ThreadManager(new ThreadStore(join(scratch, "home")));
const remote = reachableAddresses()[0];
const server = createGarryServer(
  {
    registry: join(repo, "garry-tool/testdata/registry/frontend"),
    skills: join(repo, "garry-tool/skills"),
    routing: join(repo, "garry.routing.json"),
    hosts: remote ? [remote] : [],
    threads: threadManager,
  },
  store,
);
await new Promise<void>((r) => server.listen(0, "0.0.0.0", r));
const port = (server.address() as AddressInfo).port;

let failed = 0;
const expect = (name: string, ok: boolean) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
};

try {
  const local = new GarryClient({ baseUrl: `http://127.0.0.1:${port}` });
  const features = await local.features();
  expect("features", features.some((f) => f.id === "FEAT-123"));
  const plan = await local.plan("FEAT-123");
  expect("plan with tasks in contract order", plan.tasks.length > 0 && plan.order.length === 3);
  expect("models", (await local.models()).length > 0);
  expect("skills", (await local.skills()).some((s) => s.source === "builtin"));
  expect("registry", (await local.registry()).services.length === 3);

  const events: StreamEvent[] = [];
  await local.stream("FEAT-123", (e) => events.push(e));
  expect("stream: feature first, done last", events[0]?.type === "feature" && events.at(-1)?.type === "done");
  expect("stream: every task and its logs", events.filter((e) => e.type === "task").length === plan.tasks.length && events.some((e) => e.type === "log"));

  expect("a pairing link parses", parsePairingLink("http://192.168.1.5:8123/pair?code=abc")?.code === "abc");
  expect("other links do not", parsePairingLink("http://evil.example/other?code=abc") === null && parsePairingLink("not a link") === null);

  {
    // threads through the client, with the stand-in for Claude Code
    const { execFileSync } = await import("node:child_process");
    const { writeFileSync } = await import("node:fs");
    const repoDir = join(mkdtempSync(join(tmpdir(), "garry-client-repo-")), "r");
    execFileSync("git", ["init", "-q", repoDir]);
    writeFileSync(join(repoDir, "a.txt"), "a\n");
    execFileSync("git", ["-C", repoDir, "add", "-A"]);
    execFileSync("git", ["-C", repoDir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
    const project = threadManager.store.addProject(repoDir);
    expect("projects", (await local.projects()).some((p) => p.id === project.id));
    const t = await local.createThread(project.id, "Write notes");
    const seen: ThreadEvent[] = [];
    const ctl = new AbortController();
    const following = local.threadEvents(t.id, (e) => {
      seen.push(e);
      if (e.type === "status" && e.status === "idle") ctl.abort();
    }, ctl.signal).catch(() => undefined);
    await following;
    expect("thread events stream until the turn ends", seen.some((e) => e.type === "turn_end") && seen.some((e) => e.type === "tool"));
    expect("thread diff", (await local.threadDiff(t.id)).files.some((f) => f.path === "NOTES.md"));
    expect("commit", Boolean((await local.commitThread(t.id, "Notes")).commit));
  }

  if (remote) {
    const { code } = store.createCode();
    const parsed = parsePairingLink(pairingLink(remote, port, code))!;
    const unpaired = await new GarryClient({ baseUrl: parsed.baseUrl }).features().catch((e: GarryError) => e);
    expect("an unpaired device is told to pair", unpaired instanceof GarryError && unpaired.unpaired);
    const { token, device } = await pair(parsed.baseUrl, parsed.code, "test phone");
    const phone = new GarryClient({ baseUrl: parsed.baseUrl, token });
    expect("a paired device reads", (await phone.features()).length > 0);
    store.revoke(device.id);
    const revoked = await phone.features().catch((e: GarryError) => e);
    expect("a revoked device is told to pair again", revoked instanceof GarryError && revoked.unpaired);
  } else {
    console.log("no non-loopback address: pairing cases skipped");
  }
} finally {
  server.close();
}
console.log(failed ? `\n${failed} client case(s) failed` : "\nthe client behaves as expected");
process.exitCode = failed ? 1 : 0;
