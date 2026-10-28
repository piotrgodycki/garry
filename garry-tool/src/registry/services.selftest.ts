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
import { checkArchitecture } from "./schema/architecture.js";
import { validateRegistry } from "./schema/validate.js";

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

// every kind: its default stack, what it exposes, whether it keeps a database
const kinds = mkdtempSync(join(tmpdir(), "garry-kinds-"));
const db = { engine: "postgres" };
const made = (name: string, kind: string, extra: object = {}) => addService(kinds, { name, kind, repo: `git@github.com:acme/${name}.git`, ...extra }).service;
const site = made("site", "ssg", { exposes: ["./Nope"], db });
expect("a static site starts on Astro, exposes nothing, keeps no database", site.stack === "astro" && site.exposes.length === 0 && site.db === null, JSON.stringify(site));
const web = made("web", "spa", { db });
expect("a single-page app keeps no database", web.kind === "spa" && web.stack === "react + vite" && web.db === null);
const store = made("store", "ssr", { db });
expect("a server-rendered app may own a database", store.stack === "next.js" && store.db?.engine === "postgres");
expect("pages refreshed in the background (ISR) are a kind", made("blog", "isr").kind === "isr");
expect("a mobile app starts on Expo", made("app", "mobile").stack === "expo + react-native");
const bff = made("web-bff", "bff", { exposes: ["GET /home"], db });
expect("a BFF offers endpoints and keeps no database", bff.exposes[0] === "GET /home" && bff.db === null);
const jobs = made("jobs", "worker", { exposes: ["send-receipt"], db });
expect("a worker names its jobs and may own a database", jobs.exposes[0] === "send-receipt" && jobs.db?.engine === "postgres" && jobs.stack === "node + bullmq");
expect("a serverless function is a kind", made("resize", "function", { exposes: ["POST /resize"] }).kind === "function");
made("orders", "backend", { exposes: ["POST /orders"], db });
expect("a registry of every kind passes the registry check", validateRegistry(kinds).filter((i) => i.level === "error" && i.message !== "contract file is missing").length === 0, JSON.stringify(validateRegistry(kinds)));

// on the architecture board each kind needs what it cannot work without
const svcs = ["site", "web", "store", "web-bff", "jobs", "orders", "app"].map((name) => {
  const m = parseYaml(readFileSync(join(kinds, "catalog", `${name}.yaml`), "utf8")) as { name: string; kind: string; db: unknown };
  return { name: m.name, kind: m.kind, db: m.db };
});
const board = {
  nodes: [
    { id: "web", block: "service:web", x: 0, y: 0 },
    { id: "bff", block: "service:web-bff", x: 1, y: 0 },
    { id: "jobs", block: "service:jobs", x: 2, y: 0 },
    { id: "store", block: "service:store", x: 3, y: 0 },
    { id: "app", block: "service:app", x: 4, y: 0 },
    { id: "site", block: "service:site", x: 5, y: 0 },
  ],
  edges: [{ from: "web", to: "bff", capability: "http" as const }],
};
const says = checkArchitecture(board, svcs).map((i) => i.message);
const needs = (who: string, what: string) => says.some((m) => m.startsWith(`${who} needs ${what}`));
expect("a BFF needs an API behind it", needs("web-bff", "HTTP API"));
expect("a worker needs a queue", needs("jobs", "queue"));
expect("a server-rendered app with a database needs it and a place to run", needs("store", "SQL database") && needs("store", "runs code"));
expect("a mobile app needs an API", needs("app", "HTTP API"));
expect("a static site and a SPA need nothing", !says.some((m) => m.startsWith("site needs") || m.startsWith("web needs")), JSON.stringify(says));
expect("a SPA can call a BFF", !says.some((m) => m.includes("does not provide")));

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
const served = (await (await fetch(`${base}/api/service-kinds`)).json()) as { kinds: { id: string; label: string; group: string; hint: string }[] };
expect("the kinds are served with a label and a hint", served.kinds.length === 11 && served.kinds.every((k) => k.label && k.hint && (k.group === "Frontend" || k.group === "Backend")) && served.kinds.some((k) => k.id === "bff"));
server.close();

if (failed) {
  console.error(`${failed} service check(s) failed`);
  process.exit(1);
}
console.log("service checks passed");
