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
import { GarryClient, GarryError, pair, parsePairingLink, type StreamEvent } from "./index";

const repo = new URL("../../", import.meta.url).pathname;
const store = new DeviceStore(join(mkdtempSync(join(tmpdir(), "garry-client-")), "devices.json"));
const remote = reachableAddresses()[0];
const server = createGarryServer(
  {
    registry: join(repo, "garry-registry/examples/registry-sample"),
    skills: join(repo, "garry-skills"),
    routing: join(repo, "garry.routing.json"),
    hosts: remote ? [remote] : [],
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
