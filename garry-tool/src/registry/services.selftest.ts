/**
 * Regression test for adding and removing services: names and kinds are checked,
 * a service can only consume what another one exposes, an existing one is not
 * overwritten by accident, one still in use cannot be removed, and the server
 * writes the same manifest. Run with: pnpm -C garry-tool test:services (CI runs it too).
 */
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { parse as parseYaml } from "yaml";
import { ServiceError, addService, removeService } from "./services.js";
import { createGarryServer } from "../server/server.js";
import { DeviceStore } from "../server/auth.js";

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const status = (fn: () => unknown): number => {
  try {
    fn();
    return 200;
  } catch (e) {
    return e instanceof ServiceError ? e.status : 500;
  }
};

const registry = mkdtempSync(join(tmpdir(), "garry-services-"));

expect("bad name", status(() => addService(registry, { name: "Cart", kind: "mfe-remote", repo: "r" })) === 400);
expect("bad kind", status(() => addService(registry, { name: "cart", kind: "lambda", repo: "r" })) === 400);
expect("repo required", status(() => addService(registry, { name: "cart", kind: "mfe-remote" })) === 400);

const cart = addService(registry, { name: "cart", kind: "mfe-remote", repo: "git@github.com:acme/cart.git", exposes: ["./Cart", " ./MiniCart "] });
const written = parseYaml(readFileSync(join(registry, "catalog", "cart.yaml"), "utf8")) as Record<string, unknown>;
expect("manifest written", written.name === "cart" && written.kind === "mfe-remote" && written.owner === "unassigned");
expect("exposes trimmed", JSON.stringify(written.exposes) === JSON.stringify(["./Cart", "./MiniCart"]));
expect("no missing-contract noise", cart.issues.length === 0, JSON.stringify(cart.issues));

expect("duplicate refused", status(() => addService(registry, { name: "cart", kind: "mfe-remote", repo: "r" })) === 409);
expect("replace allowed", status(() => addService(registry, { name: "cart", kind: "mfe-remote", repo: "r", exposes: ["./Cart", "./MiniCart"] }, { replace: true })) === 200);
expect("unknown consumed service", status(() => addService(registry, { name: "shell", kind: "mfe-shell", repo: "r", consumes: { search: ["./Box"] } })) === 400);
expect("unexposed module", status(() => addService(registry, { name: "shell", kind: "mfe-shell", repo: "r", consumes: { cart: ["./Nope"] } })) === 400);
addService(registry, { name: "shell", kind: "mfe-shell", repo: "r", exposes: ["./Ignored"], consumes: { cart: ["./MiniCart"] } });
const shell = parseYaml(readFileSync(join(registry, "catalog", "shell.yaml"), "utf8")) as { exposes: string[]; consumes: Record<string, string[]> };
expect("a shell exposes nothing", shell.exposes.length === 0);
expect("consumes written", shell.consumes.cart?.[0] === "./MiniCart");

expect("remove in use refused", status(() => removeService(registry, "cart")) === 409);
expect("remove unknown", status(() => removeService(registry, "nope")) === 404);
expect("remove path refused", status(() => removeService(registry, "../x")) === 404);
removeService(registry, "shell");
expect("removed", !existsSync(join(registry, "catalog", "shell.yaml")));

// the server: POST adds, DELETE removes (this computer)
const server = createGarryServer(
  { registry, skills: "garry-tool/skills", routing: join(registry, "routing.json") },
  new DeviceStore(join(registry, "devices.json")),
);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = await fetch(`${base}/api/registry/services`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "orders", kind: "backend", repo: "git@github.com:acme/orders.git", exposes: ["POST /orders"] }),
});
expect("POST adds", post.status === 200 && existsSync(join(registry, "catalog", "orders.yaml")), String(post.status));
const listed = (await fetch(`${base}/api/registry`).then((r) => r.json())) as { services: { name: string }[] };
expect("listed", listed.services.some((s) => s.name === "orders"));
const dup = await fetch(`${base}/api/registry/services`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "orders", kind: "backend", repo: "r" }) });
expect("POST duplicate is 409", dup.status === 409);
const cross = await fetch(`${base}/api/registry/services`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ name: "evil", kind: "backend", repo: "r" }),
});
expect("POST from another site refused", cross.status === 403 && !existsSync(join(registry, "catalog", "evil.yaml")));
const del = await fetch(`${base}/api/registry/services/orders`, { method: "DELETE" });
expect("DELETE removes", del.status === 200 && !existsSync(join(registry, "catalog", "orders.yaml")));
server.close();

if (failed) {
  console.error(`${failed} service check(s) failed`);
  process.exit(1);
}
console.log("service checks passed");
