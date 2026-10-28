/**
 * Regression test for tech stacks: the compatibility rules, saving and removing
 * stacks, a service built on one (stackRef), the registry check, the server and
 * the stack reaching the agent through garry sync.
 * Run with: pnpm -C garry-tool test:stacks (CI runs it too).
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { CATALOG, CATEGORIES, StackSchema, checkStack, techById } from "./schema/stacks.js";
import { STACK_TEMPLATES } from "./schema/stack-templates.js";
import { SERVICE_KIND_IDS } from "./schema/kinds.js";
import { validateRegistry } from "./schema/validate.js";
import { StackError, listStacks, removeStack, saveStack } from "./stacks.js";
import { ServiceError, addService } from "./services.js";
import { syncService } from "../sync/core.js";
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
    return e instanceof StackError || e instanceof ServiceError ? e.status : 500;
  }
};
const msgs = (ids: string[]) => checkStack(ids).map((i) => `${i.level}:${i.message}`);

// the catalog itself
const ids = new Set(CATALOG.map((t) => t.id));
expect("catalog ids are unique", ids.size === CATALOG.length);
expect("every technology is in a known category", CATALOG.every((t) => CATEGORIES.some((c) => c.id === t.category)));
expect("rules only name known technologies", CATALOG.every((t) => [...(t.conflicts ?? []), ...(t.requires ?? []).flat()].every((r) => ids.has(r))));

// the rules
expect("a sound stack has no issues", checkStack(["typescript", "react", "vite", "module-federation", "tailwind", "vitest"]).length === 0);
expect("Next.js with Vite is a conflict", msgs(["react", "nextjs", "vite"]).some((m) => m.startsWith("error:") && m.includes("Vite")));
expect("a conflict is reported once", msgs(["react", "nextjs", "vite"]).filter((m) => m.startsWith("error:")).length === 1);
expect("WordPress on Vercel is a conflict", msgs(["php", "mysql", "wordpress", "vercel"]).some((m) => m.startsWith("error:") && m.includes("Vercel")));
expect("D1 needs Workers", msgs(["d1"]).some((m) => m.startsWith("warn:") && m.includes("Cloudflare Workers")));
expect("an alternative satisfies a requirement", checkStack(["drizzle", "neon"]).length === 0);
expect("two of a single category is flagged", msgs(["node", "bun"]).some((m) => m.includes("more than one runtime")));
expect("an unknown technology is kept with a note", checkStack(["htmx"]).every((i) => i.level === "info"));

// storage
const registry = mkdtempSync(join(tmpdir(), "garry-stacks-"));
expect("bad name", status(() => saveStack(registry, { name: "Web", technologies: [{ id: "react" }] })) === 400);
expect("junk technologies are a 400, not a crash", status(() => saveStack(registry, { name: "junk", technologies: [null, 3, { id: "" }] })) === 400);
expect("empty stack", status(() => saveStack(registry, { name: "web", technologies: [] })) === 400);
const saved = saveStack(registry, { name: "web", description: "Frontends", technologies: [{ id: "react", version: "19" }, { id: "vite" }, { id: "react", version: "18" }] });
expect("a technology is kept once", saved.stack.technologies.length === 2 && saved.stack.technologies[0].version === "19");
expect("duplicate refused", status(() => saveStack(registry, { name: "web", technologies: [{ id: "vue" }] })) === 409);
expect("replace allowed", status(() => saveStack(registry, { name: "web", technologies: [{ id: "react", version: "19" }, { id: "vite" }, { id: "typescript" }] }, { replace: true })) === 200);
saveStack(registry, { name: "clash", technologies: [{ id: "react" }, { id: "nextjs" }, { id: "vite" }] });
expect("a conflicting stack is saved with its issues", listStacks(registry).find((s) => s.name === "clash")?.issues.some((i) => i.level === "error") === true);

// services built on a stack
expect("unknown stackRef refused", status(() => addService(registry, { name: "shop", kind: "mfe-remote", repo: "r", stackRef: "nope" })) === 400);
const shop = addService(registry, { name: "shop", kind: "mfe-remote", repo: "r", stackRef: "web", exposes: ["./Shop"] });
expect("stackRef fills the stack line", shop.service.stackRef === "web" && shop.service.stack === "React 19 + Vite + TypeScript", shop.service.stack);
expect("the stack lists who uses it", listStacks(registry).find((s) => s.name === "web")?.usedBy.join() === "shop");
expect("a stack in use cannot be removed", status(() => removeStack(registry, "web")) === 409);
const issues = validateRegistry(registry);
expect("the registry check warns about the conflicting stack", issues.some((i) => i.where === "stacks/clash.yaml" && i.level === "warn"));
writeFileSync(join(registry, "catalog", "ghost.yaml"), "name: ghost\nrepo: r\nstack: x\nowner: o\nstackRef: gone\n");
expect("the registry check catches a missing stack", validateRegistry(registry).some((i) => i.where === "catalog/ghost" && i.level === "error"));

// the agent gets the stack
const repo = mkdtempSync(join(tmpdir(), "garry-stacks-repo-"));
const written = syncService(repo, registry, "shop");
expect("garry sync writes .garry/stack.json", written.includes("stack.json") && JSON.parse(readFileSync(join(repo, ".garry", "stack.json"), "utf8")).name === "web");

// the server
const server = createGarryServer({ registry, skills: join(registry, "none"), routing: join(registry, "routing.json") }, new DeviceStore(join(registry, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const all = (await fetch(`${base}/api/stacks`).then((r) => r.json())) as { stacks: { name: string }[]; catalog: unknown[]; categories: unknown[] };
expect("GET /api/stacks lists stacks, catalog and categories", all.stacks.length === 2 && all.catalog.length === CATALOG.length && all.categories.length === CATEGORIES.length);
const checked = (await post("/api/stacks/check", { technologies: ["nextjs", "vite", "react"] }).then((r) => r.json())) as { issues: { level: string }[] };
expect("POST /api/stacks/check reports issues", checked.issues.some((i) => i.level === "error"));
expect("POST /api/stacks saves", (await post("/api/stacks", { name: "api", technologies: [{ id: "node" }, { id: "fastify" }] })).status === 200 && existsSync(join(registry, "stacks", "api.yaml")));
expect("POST from another site refused", (await post("/api/stacks", { name: "evil", technologies: [{ id: "node" }] }, { origin: "https://evil.example" })).status === 403);
expect("DELETE removes an unused stack", (await fetch(`${base}/api/stacks/api`, { method: "DELETE" })).status === 200 && !existsSync(join(registry, "stacks", "api.yaml")));
const served = (await (await fetch(`${base}/api/stacks`)).json()) as { templates: { name: string }[] };
expect("GET /api/stacks offers the ready-made stacks", served.templates.length === STACK_TEMPLATES.length && served.templates.some((x) => x.name === "mern"));
server.close();

// ready-made stacks: each one is valid, fits the rules as it is, and names real kinds
for (const tpl of STACK_TEMPLATES) {
  const ids = tpl.technologies.map((x) => x.id);
  const unknown = ids.filter((id) => !techById(id));
  const issues = checkStack(ids);
  expect(`the ready-made stack ${tpl.name} is valid and fits`, StackSchema.safeParse(tpl).success && !unknown.length && !issues.length && tpl.kinds.length > 0 && tpl.kinds.every((k) => (SERVICE_KIND_IDS as readonly string[]).includes(k)), JSON.stringify({ unknown, issues }));
}
expect("ready-made stacks have different names", new Set(STACK_TEMPLATES.map((x) => x.name)).size === STACK_TEMPLATES.length);
const has = (name: string, ...ids: string[]) => ids.every((id) => STACK_TEMPLATES.find((x) => x.name === name)?.technologies.some((x) => x.id === id));
expect("MERN is MongoDB, Express, React and Node", has("mern", "mongodb", "express", "react", "node"));
expect("MEAN has Angular and MEVN has Vue", has("mean", "mongodb", "express", "angular", "node") && has("mevn", "mongodb", "express", "vue", "node"));
expect("PERN is PostgreSQL, Express, React and Node", has("pern", "postgres", "express", "react", "node"));
expect("LAMP is Apache, MySQL and PHP", has("lamp", "apache", "mysql", "php"));
expect("there are stacks for iPhone, Android and both", has("ios-swiftui", "swiftui") && has("android-compose", "jetpack-compose") && has("flutter", "flutter") && has("expo", "expo", "react-native"));
// a ready-made stack saved into the registry is an ordinary stack a service can use
const pern = saveStack(registry, { name: "pern", description: "from Garry", technologies: STACK_TEMPLATES.find((x) => x.name === "pern")!.technologies });
expect("a ready-made stack saves as one of yours", pern.stack.name === "pern" && pern.issues.length === 0 && addService(registry, { name: "orders-api", kind: "backend", repo: "r", stackRef: "pern" }).service.stack.includes("PostgreSQL"));
// the rules for what the new technologies need
expect("Expo needs React Native, SwiftUI needs Swift, Flutter needs Dart", checkStack(["expo"]).some((i) => i.message.includes("React Native")) && checkStack(["swiftui"]).some((i) => i.message.includes("Swift")) && checkStack(["flutter"]).some((i) => i.message.includes("Dart")));
// a backend in every common language
const backends = STACK_TEMPLATES.filter((x) => x.kinds.includes("backend"));
const speaks = (lang: string) => backends.some((x) => x.technologies.some((t) => t.id === lang));
expect("there is a ready-made backend in TypeScript, Python, Go, Java, Kotlin, C#, PHP, Ruby and Elixir", ["typescript", "python", "go", "java", "kotlin", "csharp", "php", "ruby", "elixir"].every(speaks), ["typescript", "python", "go", "java", "kotlin", "csharp", "php", "ruby", "elixir"].filter((l) => !speaks(l)).join());
expect("Python has FastAPI and Django, Node has NestJS, PHP has Laravel", has("python-fastapi", "fastapi") && has("django", "django") && has("nestjs", "nestjs") && has("laravel", "laravel"));
expect("Rails needs Ruby, Celery a broker, Phoenix the Erlang VM", checkStack(["rails"]).some((i) => i.message.includes("Ruby")) && checkStack(["python", "celery"]).some((i) => i.message.includes("Redis")) && checkStack(["phoenix"]).some((i) => i.message.includes("BEAM")));
expect("TanStack Start and Next.js do not go together", checkStack(["react", "vite", "tanstack-start", "nextjs"]).some((i) => i.level === "error"));

if (failed) {
  console.error(`${failed} stack check(s) failed`);
  process.exit(1);
}
console.log("stack checks passed");
