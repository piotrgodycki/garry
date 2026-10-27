/**
 * Regression test for routing profiles: Garry's example stays read only, your
 * own are created from it, changed, made active and removed, a feature can pick
 * one, and the server does the same. Run with: pnpm -C garry-tool test:routing
 * (CI runs it too).
 */
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { DEFAULT_PROFILE, RoutingError, activeProfileName, listProfiles, readProfile, removeProfile, saveProfile, setActiveProfile, setStageRoute } from "./profiles.js";
import { resolveRouting, routeFor } from "./routing.js";
import { createFeature } from "../registry/features.js";
import { addService } from "../registry/services.js";
import { loadFeature } from "./plan.js";
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
    return e instanceof RoutingError ? e.status : 500;
  }
};

const registry = mkdtempSync(join(tmpdir(), "garry-routing-"));
const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";

expect("a fresh registry uses the example", activeProfileName(registry) === "default" && listProfiles(registry).profiles.length === 1);
expect("the example cannot be changed", status(() => setStageRoute(registry, "default", "spec", { model: HAIKU })) === 400);
expect("the example cannot be removed", status(() => removeProfile(registry, "default")) === 400);
expect("no profile may be called default", status(() => saveProfile(registry, { name: "default", from: "default" })) === 400);
expect("an unknown model is refused", status(() => saveProfile(registry, { name: "x", defaults: { agent: "garry-dev", model: "gpt-9" } })) === 400);

const fast = saveProfile(registry, { name: "fast", from: "default" });
expect("a profile starts as a copy", JSON.stringify(fast.stages) === JSON.stringify(DEFAULT_PROFILE.stages) && fast.description === "Started from default");
expect("a duplicate name is refused", status(() => saveProfile(registry, { name: "fast", from: "default" })) === 409);
setStageRoute(registry, "fast", "review", { model: SONNET });
setStageRoute(registry, "fast", "implement", { agent: "garry-reviewer" });
const changed = readProfile(registry, "fast")!;
expect("a stage's model changes, its agent stays", changed.stages.review?.model === SONNET && changed.stages.review?.agent === "garry-reviewer");
expect("a stage's agent changes, its model stays", changed.stages.implement?.agent === "garry-reviewer" && changed.stages.implement?.model === HAIKU);
expect("an unknown stage is refused", status(() => setStageRoute(registry, "fast", "deploy", { model: SONNET })) === 400);

expect("the example is used until another is active", routeFor(resolveRouting(undefined, undefined, { registry }), "review").model === DEFAULT_PROFILE.stages.review!.model);
setActiveProfile(registry, "fast");
expect("the active profile routes the stages", routeFor(resolveRouting(undefined, undefined, { registry }), "review").model === SONNET);
expect("a feature can pick another profile", routeFor(resolveRouting(undefined, undefined, { registry, profile: "default" }), "review").model === DEFAULT_PROFILE.stages.review!.model);
expect("a feature override still wins", routeFor(resolveRouting(undefined, { review: { agent: "x", model: HAIKU } }, { registry }), "review").model === HAIKU);

// a folder's garry.routing.json is the example
const legacy = join(registry, "garry.routing.json");
writeFileSync(legacy, JSON.stringify({ defaults: { agent: "garry-dev", model: HAIKU }, stages: { spec: { agent: "garry-analyst", model: HAIKU } } }));
expect("garry.routing.json becomes the example", listProfiles(registry, legacy).profiles[0].stages.spec?.model === HAIKU);

// features
addService(registry, { name: "api", kind: "backend", repo: "r" });
expect("a feature with an unknown profile is refused", (() => {
  try {
    createFeature(registry, { title: "x", routing: "nope" });
    return false;
  } catch {
    return true;
  }
})());
const f = createFeature(registry, { title: "Uses fast", services: ["api"], routing: "fast" });
expect("a feature keeps its profile", loadFeature(registry, f.id).routing === "fast");

// removing the active profile falls back to the example
removeProfile(registry, "fast");
expect("removing the active profile goes back to the example", activeProfileName(registry) === "default" && !existsSync(join(registry, "routing", "fast.json")));

// the server
saveProfile(registry, { name: "team", from: "default" });
const server = createGarryServer({ registry, skills: join(registry, "none"), routing: join(registry, "none.json") }, new DeviceStore(join(registry, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const listed = (await fetch(`${base}/api/routings`).then((r) => r.json())) as { active: string; profiles: { name: string }[] };
expect("GET /api/routings lists the example and yours", listed.active === "default" && listed.profiles.map((p) => p.name).join() === "default,team");
expect("POST /api/routing refuses the example", (await post("/api/routing", { stage: "spec", model: HAIKU })).status === 400);
expect("POST /api/routings/active switches", (await post("/api/routings/active", { name: "team" })).status === 200);
expect("POST /api/routing changes the active profile", (await post("/api/routing", { stage: "spec", model: HAIKU })).status === 200 && readProfile(registry, "team")!.stages.spec?.model === HAIKU);
const active = (await fetch(`${base}/api/routing`).then((r) => r.json())) as { name: string };
expect("GET /api/routing returns the active profile", active.name === "team");
expect("POST /api/routings creates a copy", (await post("/api/routings", { name: "copy", from: "team" })).status === 200 && readProfile(registry, "copy")!.stages.spec?.model === HAIKU);
expect("a write from another site is refused", (await post("/api/routings", { name: "evil", from: "default" }, { origin: "https://evil.example" })).status === 403);
expect("DELETE removes a profile", (await fetch(`${base}/api/routings/copy`, { method: "DELETE" })).status === 200 && !readProfile(registry, "copy"));
server.close();

if (failed) {
  console.error(`${failed} routing check(s) failed`);
  process.exit(1);
}
console.log("routing checks passed");
