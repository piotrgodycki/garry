/**
 * Regression test for the architecture board: the block catalog, the rules
 * (only fitting pieces join, binding-only blocks, missing needs), saving and
 * the server. Run with: pnpm -C garry-tool test:architecture (CI runs it too).
 */
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { CAPABILITIES, COMPONENTS, PROVIDERS, checkArchitecture, type Architecture } from "./schema/architecture.js";
import { ARCHITECTURE_TEMPLATES } from "./schema/templates.js";
import { validateRegistry } from "./schema/validate.js";
import { ArchitectureError, readArchitecture, saveArchitecture } from "./architecture.js";
import { aiSuggestions, quickFixes } from "../architecture/suggest.js";
import { fileURLToPath } from "node:url";
import { addService } from "./services.js";
import { createGarryServer } from "../server/server.js";
import { DeviceStore } from "../server/auth.js";

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const n = (id: string, block: string) => ({ id, block, x: 0, y: 0 });
const levels = (a: Architecture, services: { name: string; kind?: string; db?: unknown }[] = []) => checkArchitecture(a, services).map((i) => `${i.level}:${i.message}`);

// the catalog
const caps = new Set(Object.keys(CAPABILITIES));
expect("block ids are unique", new Set(COMPONENTS.map((c) => c.id)).size === COMPONENTS.length);
{
  // an iPhone app and an Android app are clients that need an API
  const apps = { nodes: [{ id: "ios", block: "ios-app", x: 0, y: 0 }, { id: "android", block: "android-app", x: 1, y: 0 }, { id: "api", block: "aws-lambda", x: 2, y: 0 }], edges: [{ from: "ios", to: "api", capability: "http" as const }] };
  const said = checkArchitecture(apps, []).map((i) => i.message);
  expect("an Android app without an API is told it needs one", said.some((m) => m.startsWith("Android app needs HTTP API")));
  expect("an iOS app linked to an API is fine", !said.some((m) => m.startsWith("iOS app needs")));
}
expect("every block names known capabilities", COMPONENTS.every((c) => [...c.provides, ...(c.needs ?? [])].every((x) => caps.has(x))));
expect("every block has a known provider", COMPONENTS.every((c) => PROVIDERS.includes(c.provider)));

// ready-made architectures: valid, and nothing for the rules to say
expect("template ids are unique", new Set(ARCHITECTURE_TEMPLATES.map((t) => t.id)).size === ARCHITECTURE_TEMPLATES.length);
for (const t of ARCHITECTURE_TEMPLATES) {
  const issues = checkArchitecture(t.architecture);
  expect(`template ${t.id} is sound`, issues.length === 0 && t.architecture.nodes.every((n) => COMPONENTS.some((c) => c.id === n.block)), issues.map((i) => i.message).join(" | "));
}

// the rules
const sound: Architecture = {
  nodes: [n("b", "browser"), n("cdn", "cf-cdn"), n("w", "cf-workers"), n("d1", "cf-d1")],
  edges: [
    { from: "b", to: "cdn", capability: "web" },
    { from: "cdn", to: "w", capability: "web" },
    { from: "w", to: "d1", capability: "sql" },
  ],
};
expect("a sound board has nothing to say", levels(sound).length === 0, levels(sound).join(" | "));
expect("a link to something that does not provide it is an error", levels({ nodes: [n("w", "cf-workers"), n("r2", "cf-r2")], edges: [{ from: "w", to: "r2", capability: "sql" }] }).some((m) => m.startsWith("error:") && m.includes("does not provide")));
expect("D1 from Lambda is an error", levels({ nodes: [n("l", "aws-lambda"), n("d1", "cf-d1")], edges: [{ from: "l", to: "d1", capability: "sql" }] }).some((m) => m.startsWith("error:") && m.includes("only reachable from Cloudflare")));
expect("a missing need is a warning", levels({ nodes: [n("wp", "wordpress")], edges: [] }).some((m) => m.startsWith("warn:") && m.includes("SQL database")));
expect("RDS from Vercel warns about pooling", levels({ nodes: [n("v", "vercel-app"), n("db", "aws-rds-postgres")], edges: [{ from: "v", to: "db", capability: "sql" }] }).some((m) => m.startsWith("warn:") && m.includes("pooling")));

// services as blocks
const services = [{ name: "orders", kind: "backend", db: { engine: "postgres" } }, { name: "shell", kind: "mfe-shell" }, { name: "cart", kind: "mfe-remote" }];
const onLambda: Architecture = {
  nodes: [n("o", "service:orders"), n("l", "aws-lambda"), n("d1", "cf-d1")],
  edges: [
    { from: "o", to: "l", capability: "compute" },
    { from: "o", to: "d1", capability: "sql" },
  ],
};
expect("a service hosted on Lambda cannot use D1", levels(onLambda, services).some((m) => m.startsWith("error:") && m.includes("runs elsewhere")));
const onWorkers: Architecture = { nodes: [n("o", "service:orders"), n("w", "cf-workers"), n("d1", "cf-d1")], edges: [{ from: "o", to: "w", capability: "compute" }, { from: "o", to: "d1", capability: "sql" }] };
expect("on Workers it can", !levels(onWorkers, services).some((m) => m.startsWith("error:")), levels(onWorkers, services).join(" | "));
expect("a backend with a database needs one", levels({ nodes: [n("o", "service:orders"), n("w", "cf-workers")], edges: [{ from: "o", to: "w", capability: "compute" }] }, services).some((m) => m.includes("needs SQL database")));
expect("a shell needs its microfrontends", levels({ nodes: [n("s", "service:shell")], edges: [] }, services).some((m) => m.includes("needs microfrontend module")));
expect("registry services missing from the board are noted", levels({ nodes: [], edges: [] }, services).filter((m) => m.startsWith("info:")).length === 3);

// suggestions: quick fixes from the rules
const fixes = quickFixes({ nodes: [n("w", "cf-workers"), n("wp", "wordpress"), n("pg", "postgres")], edges: [] }, []);
expect("an open need on the board gets a link to what is already there", fixes.some((f) => f.links[0]?.from === "wp" && f.links[0]?.to === "pg" && f.add.length === 0));
const svcFixes = quickFixes({ nodes: [n("o", "service:orders"), n("w", "cf-workers")], edges: [{ from: "o", to: "w", capability: "compute" }] }, services);
expect("a service on Workers is offered D1 first", svcFixes[0]?.add[0]?.block === "cf-d1", svcFixes.map((f) => f.title).join(" | "));
expect("binding-only blocks are not offered off their platform", !quickFixes({ nodes: [n("o", "service:orders"), n("l", "aws-lambda")], edges: [{ from: "o", to: "l", capability: "compute" }] }, services).some((f) => f.add[0]?.block === "cf-d1"));

const cdnFixes = quickFixes({ nodes: [n("cdn", "cf-cdn"), n("cdn2", "aws-cloudfront")], edges: [] }, []);
expect("a CDN is not offered another CDN as its origin", !cdnFixes.some((f) => ["cdn", "cdn2"].includes(f.links[0]?.to ?? "") || ["cf-cdn", "aws-cloudfront"].includes(f.add[0]?.block ?? "")), cdnFixes.map((f) => f.title).join(" | "));

// suggestions from Garry (a stand-in for claude)
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../architecture/fake-claude-architect.mjs", import.meta.url));
const ai = await aiSuggestions({ nodes: [n("o", "service:orders")], edges: [] }, services, "a shop");
expect("Garry's answer is parsed from the claude envelope", ai.summary.startsWith("Add a database") && ai.suggestions[0]?.add[0]?.block === "neon");
expect("suggestions with blocks that do not exist are dropped", ai.suggestions.length === 1);

// storage
const registry = mkdtempSync(join(tmpdir(), "garry-arch-"));
expect("an empty registry has an empty board", readArchitecture(registry).nodes.length === 0);
const saved = saveArchitecture(registry, {
  nodes: [n("w", "cf-workers"), n("d1", "cf-d1")],
  edges: [
    { from: "w", to: "d1", capability: "sql" },
    { from: "w", to: "d1", capability: "sql" },
    { from: "w", to: "gone", capability: "sql" },
  ],
});
expect("repeated and dangling links are dropped", saved.architecture.edges.length === 1);
expect("bad input is a 400", (() => {
  try {
    saveArchitecture(registry, { nodes: [{ id: "a b", block: "x" }] });
    return false;
  } catch (e) {
    return e instanceof ArchitectureError && e.status === 400;
  }
})());
addService(registry, { name: "api", kind: "backend", repo: "r" });
saveArchitecture(registry, { nodes: [n("l", "aws-lambda"), n("d1", "cf-d1")], edges: [{ from: "l", to: "d1", capability: "sql" }] });
expect("the registry check reports a broken board", validateRegistry(registry).some((i) => i.where === "architecture.json" && i.level === "error"));

// the server
const server = createGarryServer({ registry, skills: join(registry, "none"), routing: join(registry, "none.json") }, new DeviceStore(join(registry, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const state = (await fetch(`${base}/api/architecture`).then((r) => r.json())) as { architecture: Architecture; components: unknown[]; services: { id: string }[]; issues: unknown[]; templates: unknown[] };
expect("GET /api/architecture offers the ready-made architectures", state.templates.length === ARCHITECTURE_TEMPLATES.length);
expect("GET /api/architecture has the board, the blocks and the services", state.architecture.nodes.length === 2 && state.components.length === COMPONENTS.length && state.services[0]?.id === "service:api");
const checked = (await post("/api/architecture/check", sound).then((r) => r.json())) as { issues: { level: string }[] };
expect("POST /api/architecture/check checks a draft", !checked.issues.some((i) => i.level === "error"));
expect("POST /api/architecture saves", (await post("/api/architecture", sound)).status === 200 && JSON.parse(readFileSync(join(registry, "architecture.json"), "utf8")).nodes.length === 4);
expect("a write from another site is refused", (await post("/api/architecture", { nodes: [], edges: [] }, { origin: "https://evil.example" })).status === 403 && existsSync(join(registry, "architecture.json")) && readArchitecture(registry).nodes.length === 4);
server.close();

if (failed) {
  console.error(`${failed} architecture check(s) failed`);
  process.exit(1);
}
console.log("architecture checks passed");
