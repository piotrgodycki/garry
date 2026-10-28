/**
 * Regression test for routing profiles: the default one (Garry's values until
 * changed, and back on reset), your own created from it, changed, made active
 * and removed, a feature can pick one, and the server does the same. Run with: pnpm -C garry-tool test:routing
 * (CI runs it too).
 */
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { DEFAULT_PROFILE, RoutingError, activeProfileName, listProfiles, readProfile, removeProfile, saveProfile, setActiveProfile, setStageRoute } from "./profiles.js";
import { resolveRouting, routeFor } from "./routing.js";
import { MODELS } from "./models.js";
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
const HAIKU = "claude-haiku-5-5";
const SONNET = "claude-sonnet-5-5";

expect("a fresh registry uses the example", activeProfileName(registry) === "default" && listProfiles(registry).profiles.length === 1);
expect("the default starts with Garry's values", readProfile(registry, "default")!.builtin === true);
const changedDefault = setStageRoute(registry, "default", "spec", { model: HAIKU });
expect("the default can be changed like any profile", changedDefault.stages.spec!.model === HAIKU && readProfile(registry, "default")!.stages.spec!.model === HAIKU && !readProfile(registry, "default")!.builtin && existsSync(join(registry, "routing", "default.json")));
expect("it is listed once", listProfiles(registry).profiles.filter((p) => p.name === "default").length === 1 && listProfiles(registry).profiles.length === 1);
expect("a new default cannot be created over it", status(() => saveProfile(registry, { name: "default", from: "default" })) === 409);
removeProfile(registry, "default");
expect("reset puts Garry's values back", readProfile(registry, "default")!.builtin === true && readProfile(registry, "default")!.stages.spec!.model === DEFAULT_PROFILE.stages.spec!.model && !existsSync(join(registry, "routing", "default.json")));
expect("an unknown model is refused", status(() => saveProfile(registry, { name: "x", defaults: { agent: "garry-dev", model: "gpt-9" } })) === 400);

// Claude 5 by default; a profile saved with an earlier generation keeps working
expect("the default routes to Claude 5", [DEFAULT_PROFILE.defaults, ...Object.values(DEFAULT_PROFILE.stages)].every((r) => r && MODELS.some((m) => m.id === r.model && !m.previous)));
expect("the newest models are offered first", MODELS.slice(0, 4).map((m) => m.label).join() === "Opus 5.5,Sonnet 5.5,Haiku 5.5,Fable 5.1" && MODELS.slice(4).every((m) => m.previous));
expect("a profile on an earlier model is still accepted", status(() => saveProfile(registry, { name: "older", defaults: { agent: "garry-dev", model: "claude-opus-4-8" } })) === 200 && readProfile(registry, "older")?.defaults.model === "claude-opus-4-8");
if (readProfile(registry, "older")) removeProfile(registry, "older");

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
expect("POST /api/routing changes the default too", (await post("/api/routing", { profile: "default", stage: "test", model: HAIKU })).status === 200 && readProfile(registry, "default")!.stages.test?.model === HAIKU);
expect("DELETE /api/routings/default resets it", (await fetch(`${base}/api/routings/default`, { method: "DELETE" })).status === 200 && readProfile(registry, "default")!.builtin === true);
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
