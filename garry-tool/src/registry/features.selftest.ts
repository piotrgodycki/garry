/**
 * Regression test for creating features: ids count up, titles and services are
 * checked against the registry, the document is one garry feature can plan, and
 * the server creates and removes them. Run with: pnpm -C garry-tool test:features
 * (CI runs it too).
 */
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { FeatureError, createFeature, removeFeature } from "./features.js";
import { addService } from "./services.js";
import { buildPlan, listFeatures } from "../orchestrate/plan.js";
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
    return e instanceof FeatureError ? e.status : 500;
  }
};

const skills = fileURLToPath(new URL("../../skills", import.meta.url));
const registry = mkdtempSync(join(tmpdir(), "garry-features-"));
addService(registry, { name: "cart", kind: "mfe-remote", repo: "r", exposes: ["./Cart"] });
addService(registry, { name: "shell", kind: "mfe-shell", repo: "r", consumes: { cart: ["./Cart"] } });

expect("title required", status(() => createFeature(registry, { title: "  " })) === 400);
expect("title too long", status(() => createFeature(registry, { title: "x".repeat(121) })) === 400);
expect("unknown service", status(() => createFeature(registry, { title: "A", services: ["nope"] })) === 400);
expect("unknown contract", status(() => createFeature(registry, { title: "A", contractChanges: ["secrets.json"] })) === 400);

const first = createFeature(registry, { title: "Quick cart  in the header!", goal: "Show the cart anywhere.", services: ["shell", "cart", "cart"], contractChanges: ["events.json"] });
expect("first id", first.id === "FEAT-1");
expect("file name", first.file.endsWith("FEAT-1-quick-cart-in-the-header.md"), first.file);
expect("services deduplicated", first.services.join() === "shell,cart");
const doc = readFileSync(first.file, "utf8");
expect("goal written", doc.includes("## Goal\n\nShow the cart anywhere."));
expect("starts at spec", listFeatures(registry)[0]?.status === "spec");
const plan = buildPlan({ registry, skillsRoot: skills, featureId: "FEAT-1" });
expect("plannable, contract first order", plan.order.join() === "cart,shell", plan.order.join());

const second = createFeature(registry, { title: "Ünïcode ✓ only" });
expect("next id", second.id === "FEAT-2");
expect("a spec may have no services", second.services.length === 0 && buildPlan({ registry, skillsRoot: skills, featureId: "FEAT-2" }).order.length === 0);
removeFeature(registry, "FEAT-1");
expect("ids never reused while a higher one exists", createFeature(registry, { title: "Third" }).id === "FEAT-3");
expect("remove unknown", status(() => removeFeature(registry, "FEAT-99")) === 404);

// the server: POST creates, DELETE removes (this computer)
const server = createGarryServer(
  { registry, skills, routing: join(registry, "routing.json") },
  new DeviceStore(join(registry, "devices.json")),
);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/features`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const made = await post({ title: "From the dashboard", services: ["cart"] });
const madeBody = (await made.json()) as { id: string };
expect("POST creates", made.status === 200 && madeBody.id === "FEAT-4");
const listed = (await fetch(`${base}/api/features`).then((r) => r.json())) as { features: { id: string }[] };
expect("listed", listed.features.some((f) => f.id === "FEAT-4"));
expect("POST bad input is 400", (await post({ title: "" })).status === 400);
const cross = await post({ title: "Evil" }, { origin: "https://evil.example" });
expect("POST from another site refused", cross.status === 403 && listFeatures(registry).every((f) => f.title !== "Evil"));
const del = await fetch(`${base}/api/features/FEAT-4`, { method: "DELETE" });
expect("DELETE removes", del.status === 200 && !readdirSync(join(registry, "features")).some((f) => f.startsWith("FEAT-4-")));
server.close();

if (failed) {
  console.error(`${failed} feature check(s) failed`);
  process.exit(1);
}
console.log("feature checks passed");
