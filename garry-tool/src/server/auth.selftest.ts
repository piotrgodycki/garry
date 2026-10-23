/**
 * Regression test for device pairing: a request from another machine needs a
 * paired device token, codes work once, device management stays on this machine
 * and a revoked token stops working. Run with: pnpm -C garry-tool test:auth (CI
 * runs it too). It needs a non-loopback address to play the other device.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createGarryServer } from "./server.js";
import { DeviceStore } from "./auth.js";
import { reachableAddresses } from "./pairing.js";

const remote = reachableAddresses()[0];
if (!remote) {
  console.log("no non-loopback address on this machine: device pairing cases skipped");
  process.exit(0);
}

const store = new DeviceStore(join(mkdtempSync(join(tmpdir(), "garry-auth-")), "devices.json"));
const server = createGarryServer(
  { registry: "garry-registry/examples/registry-sample", skills: "garry-skills", routing: "garry.routing.json" },
  store,
);
await new Promise<void>((r) => server.listen(0, "0.0.0.0", r));
const port = (server.address() as AddressInfo).port;

const call = async (host: string, path: string, init: RequestInit = {}) => {
  const res = await fetch(`http://${host}:${port}${path}`, init);
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
};
const post = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`);
  if (!ok) failed++;
};

try {
  expect("this machine needs no token", (await call("127.0.0.1", "/api/features")).status === 200);
  expect("another device without a token is refused", (await call(remote, "/api/features")).status === 401);
  expect("another device cannot mint pairing codes", (await call(remote, "/api/pair/codes", { method: "POST" })).status === 401);
  expect("a wrong code does not pair", (await call(remote, "/api/pair", post({ code: "guess" }))).status === 401);

  const code = (await call("127.0.0.1", "/api/pair/codes", { method: "POST" })).body?.code as string;
  const paired = await call(remote, "/api/pair", post({ code, name: "test phone" }));
  const token = paired.body?.token as string;
  expect("a valid code pairs once", paired.status === 200 && typeof token === "string");
  expect("the same code does not pair twice", (await call(remote, "/api/pair", post({ code }))).status === 401);

  const bearer = { authorization: `Bearer ${token}` };
  expect("a paired device reads", (await call(remote, "/api/features", { headers: bearer })).status === 200);
  expect("a paired device reads the stream with access_token", (await call(remote, `/api/registry?access_token=${token}`)).status === 200);
  expect("access_token is not accepted for writes", (await call(remote, `/api/routing?access_token=${token}`, post({ stage: "spec", model: "x" }))).status === 401);
  expect("a paired device cannot manage devices", (await call(remote, "/api/devices", { headers: bearer })).status === 403);
  expect("a paired device cannot mint codes", (await call(remote, "/api/pair/codes", { method: "POST", headers: bearer })).status === 403);
  expect("the token is stored hashed", !JSON.stringify(store.list()).includes(token));

  const id = store.list()[0]?.id ?? "";
  expect("this machine revokes a device", (await call("127.0.0.1", `/api/devices/${id}`, { method: "DELETE" })).status === 200);
  expect("a revoked token stops working", (await call(remote, "/api/features", { headers: bearer })).status === 401);
} finally {
  server.close();
}

console.log(failed ? `\n${failed} device pairing case(s) failed` : "\ndevice pairing behaves as expected");
process.exitCode = failed ? 1 : 0;
