/**
 * Regression test for device pairing: a request from another machine needs a
 * paired device token, codes work once, device management stays on this machine
 * and a revoked token stops working. Run with: pnpm -C garry-tool test:auth (CI
 * runs it too). It needs a non-loopback address to play the other device.
 */
import { mkdtempSync } from "node:fs";
import { request } from "node:http";
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
  { registry: "garry-registry/examples/registry-sample", skills: "garry-skills", routing: "garry.routing.json", hosts: [remote] },
  store,
);
await new Promise<void>((r) => server.listen(0, "0.0.0.0", r));
const port = (server.address() as AddressInfo).port;

const call = async (host: string, path: string, init: RequestInit = {}) => {
  const res = await fetch(`http://${host}:${port}${path}`, init);
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
};
// fetch drops the Host and Origin headers a browser would set, so these go raw
const raw = (host: string, path: string, method: string, headers: Record<string, string>, body?: string) =>
  new Promise<number>((done, fail) => {
    const req = request({ host, port, path, method, headers }, (res) => {
      res.resume();
      done(res.statusCode ?? 0);
    });
    req.on("error", fail);
    req.end(body);
  });
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

  expect("a rebound host name is refused", (await raw("127.0.0.1", "/api/features", "GET", { host: `rebound.example:${port}` })) === 403);

  const cookiePaired = await fetch(`http://${remote}:${port}/api/pair`, post({ code: (await call("127.0.0.1", "/api/pair/codes", { method: "POST" })).body?.code, name: "browser", session: "cookie" }));
  const cookie = (cookiePaired.headers.get("set-cookie") ?? "").split(";")[0];
  const cookieBody = (await cookiePaired.json()) as Record<string, unknown>;
  expect("a browser gets an HttpOnly SameSite cookie, not the token", /HttpOnly/.test(cookiePaired.headers.get("set-cookie") ?? "") && /SameSite=Strict/.test(cookiePaired.headers.get("set-cookie") ?? "") && !("token" in cookieBody));
  expect("the cookie authenticates the browser", (await call(remote, "/api/features", { headers: { cookie } })).status === 200);
  const routing = JSON.stringify({ stage: "spec", model: "x" });
  expect("a cookie write from the dashboard's own origin passes the origin check", (await raw(remote, "/api/routing", "POST", { cookie, origin: `http://${remote}:${port}`, "content-type": "application/json" }, routing)) !== 403);
  expect("a cookie write from another site is refused", (await raw(remote, "/api/routing", "POST", { cookie, origin: "http://evil.example", "content-type": "application/json" }, routing)) === 403);

  const id = store.list()[0]?.id ?? "";
  expect("this machine revokes a device", (await call("127.0.0.1", `/api/devices/${id}`, { method: "DELETE" })).status === 200);
  expect("a revoked token stops working", (await call(remote, "/api/features", { headers: bearer })).status === 401);
} finally {
  server.close();
}

console.log(failed ? `\n${failed} device pairing case(s) failed` : "\ndevice pairing behaves as expected");
process.exitCode = failed ? 1 : 0;
