/**
 * Regression test for the architecture wizard and the boards per repository.
 * Every combination of answers builds a board the rules have nothing against
 * (no error, no missing piece), with every client, the data and every extra
 * asked for on it; the registry's services join it with what they need. A
 * board per repository is kept apart from the others and from the whole
 * project's, keeps its wizard answers when edited by hand, and is reset on its
 * own, from this computer only. Run with: pnpm -C garry-tool test:wizard (CI runs it too).
 */
import { existsSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { buildFromWizard, type WizardAnswers } from "./wizard.js";
import { WIZARD_CLIENTS, WIZARD_DATA, WIZARD_EXTRAS, WIZARD_PLATFORMS } from "../registry/schema/wizard.js";
import { CAPABILITIES, checkArchitecture, componentById, serviceBlock, type Capability } from "../registry/schema/architecture.js";
import { listBoards, readArchitecture, resetArchitecture, saveArchitecture } from "../registry/architecture.js";
import { addService } from "../registry/services.js";
import { validateRegistry } from "../registry/schema/validate.js";
import { bundlePathOk } from "../project/bundle.js";

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const subsets = <T>(xs: readonly T[]): T[][] => xs.reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]]);
const EXTRA_CAP: Record<string, Capability> = { auth: "auth", cms: "content", files: "blob", queue: "queue", cache: "cache", search: "search", email: "email", cdn: "cdn", events: "events" };

// every combination of answers, without services
let boards = 0;
const bad: string[] = [];
for (const clients of subsets(WIZARD_CLIENTS).filter((s) => s.length))
  for (const platform of WIZARD_PLATFORMS)
    for (const data of WIZARD_DATA)
      for (const extras of subsets(WIZARD_EXTRAS)) {
        const answers: WizardAnswers = { clients, platform, data, extras, services: false };
        const board = buildFromWizard(answers);
        boards++;
        const issues = checkArchitecture(board).filter((i) => i.level !== "info");
        const blocks = board.nodes.map((n) => componentById(n.block)!);
        const provided = new Set(blocks.flatMap((b) => b.provides));
        const missing = [
          // a CDN stands in front of pages, so it comes only with a browser
          ...extras.filter((e) => !provided.has(EXTRA_CAP[e]) && !(e === "cdn" && !clients.includes("web"))),
          ...(data === "sql" && !provided.has("sql") ? ["sql"] : []),
          ...(data === "document" && !provided.has("document") ? ["document"] : []),
          ...clients.filter((c) => !board.nodes.some((n) => n.block === { web: "browser", ios: "ios-app", android: "android-app" }[c])),
        ];
        const linked = board.nodes.every((n) => board.edges.some((e) => e.from === n.id || e.to === n.id));
        if (issues.length || missing.length || !linked) bad.push(`${JSON.stringify(answers)} -> ${[...issues.map((i) => i.message), ...missing.map((m) => `no ${m}`), ...(linked ? [] : ["a block linked to nothing"])].join("; ")}`);
      }
expect(`all ${boards} combinations of answers build a sound board with everything asked for`, boards > 60000 && bad.length === 0, `${bad.length} bad, e.g. ${bad.slice(0, 3).join(" | ")}`);

// on Adobe, pages come from Edge Delivery with their content from AEM, code runs on App Builder
const adobe = buildFromWizard({ clients: ["web", "ios"], platform: "adobe", data: "none", extras: ["cms", "files", "events"], services: false });
const idOf = (block: string) => adobe.nodes.find((n) => n.block === block)?.id;
const has = (from: string | undefined, to: string | undefined, capability: string) => adobe.edges.some((e) => e.from === from && e.to === to && e.capability === capability);
expect(
  "on Adobe a browser gets pages from Edge Delivery, which takes its content from AEM Sites",
  has("browser", idOf("aem-eds"), "web") && has(idOf("aem-eds"), idOf("aem-sites"), "content"),
  JSON.stringify(adobe.edges),
);
expect(
  "on Adobe the app runs on App Builder, with files in AEM Assets and events through I/O Events",
  has("ios", idOf("adobe-app-builder"), "http") && has(idOf("adobe-app-builder"), idOf("aem-assets"), "blob") && has(idOf("adobe-app-builder"), idOf("adobe-io-events"), "events"),
  JSON.stringify(adobe.edges),
);

// wrong answers are refused
const refused = (a: unknown) => {
  try {
    buildFromWizard(a);
    return false;
  } catch {
    return true;
  }
};
expect("answers without a client, or with an unknown platform or extra, are refused", refused({ clients: [], platform: "aws", data: "sql" }) && refused({ clients: ["web"], platform: "heroku", data: "sql" }) && refused({ clients: ["web"], platform: "aws", data: "sql", extras: ["blockchain"] }));

// with the registry's services: each one is on the board with what it needs
const registry = mkdtempSync(join(tmpdir(), "garry-wizard-"));
const kinds = ["mfe-shell", "mfe-remote", "spa", "ssr", "ssg", "mobile", "backend", "bff", "worker", "function"];
for (const kind of kinds) addService(registry, { name: `my-${kind}`, kind, repo: `git@github.com:acme/${kind}.git`, db: ["backend", "worker", "ssr"].includes(kind) ? { engine: "postgres" } : null });
const services = kinds.map((k) => ({ name: `my-${k}`, kind: k, db: ["backend", "worker", "ssr"].includes(k) ? { engine: "postgres" } : null }));
const withServices: string[] = [];
for (const platform of WIZARD_PLATFORMS)
  for (const data of WIZARD_DATA) {
    const board = buildFromWizard({ clients: ["web", "ios"], platform, data, extras: [], services: true }, services);
    const issues = checkArchitecture(board, services).filter((i) => i.level !== "info");
    const onBoard = services.every((s) => board.nodes.some((n) => n.block === `service:${s.name}`));
    const needsMet = services.every((s) => (serviceBlock(s).needs ?? []).every((need) => board.edges.some((e) => e.from === `svc-${s.name}` && e.capability === need)));
    if (issues.length || !onBoard || !needsMet) withServices.push(`${platform}/${data}: ${issues.map((i) => i.message).join("; ")}${onBoard ? "" : " (a service is missing)"}${needsMet ? "" : " (a need is not linked)"}`);
  }
expect("your services join the board, each linked to what it needs, on every platform", withServices.length === 0, withServices.slice(0, 3).join(" | "));
const shell = buildFromWizard({ clients: ["web"], platform: "vercel", data: "none", extras: [], services: true }, services);
expect("a browser reaches every service of yours that serves pages", services.filter((s) => serviceBlock(s).provides.includes("web")).every((s) => shell.edges.some((e) => e.from === "browser" && e.to === `svc-${s.name}` && e.capability === "web")));
expect("a shell is joined to the microfrontends, a BFF to an API of yours", shell.edges.some((e) => e.from === "svc-my-mfe-shell" && e.to === "svc-my-mfe-remote" && e.capability === "module") && shell.edges.some((e) => e.from === "svc-my-bff" && e.capability === "http" && e.to.startsWith("svc-")));
expect("without services, none are put on the board", !buildFromWizard({ clients: ["web"], platform: "vercel", data: "sql", services: false }, services).nodes.some((n) => n.block.startsWith("service:")));

// boards per repository: apart, keep their answers, reset alone
const answers: WizardAnswers = { clients: ["web"], platform: "cloudflare", data: "sql", extras: ["auth"], services: false };
saveArchitecture(registry, buildFromWizard(answers), "shop");
saveArchitecture(registry, buildFromWizard({ ...answers, platform: "aws" }), "admin");
saveArchitecture(registry, buildFromWizard({ ...answers, platform: "vercel" }));
expect("each repository has its own board, apart from the whole project's", readArchitecture(registry, "shop").nodes.some((n) => n.block === "cf-workers") && readArchitecture(registry, "admin").nodes.some((n) => n.block === "aws-lambda") && readArchitecture(registry).nodes.some((n) => n.block === "vercel-app"));
expect("the wizard's answers are kept with the board", readArchitecture(registry, "shop").wizard?.platform === "cloudflare");
const byHand = readArchitecture(registry, "shop");
saveArchitecture(registry, { nodes: byHand.nodes.slice(0, -1), edges: byHand.edges }, "shop");
expect("editing a board by hand keeps its answers", readArchitecture(registry, "shop").wizard?.platform === "cloudflare" && readArchitecture(registry, "shop").nodes.length === byHand.nodes.length - 1);
saveArchitecture(registry, { nodes: byHand.nodes, edges: byHand.edges, wizard: null }, "shop");
expect("answers can be cleared on purpose", readArchitecture(registry, "shop").wizard == null);
const listed = listBoards(registry, ["shop", "admin", "blog", "../evil"]);
expect("the boards are listed, with how full they are, and odd names left out", listed.map((b) => `${b.id || "project"}:${b.blocks > 0}`).join() === "project:true,shop:true,admin:true,blog:false");
resetArchitecture(registry, "admin");
expect("resetting a board empties that one only", readArchitecture(registry, "admin").nodes.length === 0 && readArchitecture(registry, "shop").nodes.length > 0 && readArchitecture(registry).nodes.length > 0);
let thrown = 0;
for (const name of ["../x", "a/b", ".hidden"]) {
  try {
    readArchitecture(registry, name);
  } catch {
    thrown++;
  }
}
expect("a board name cannot leave the registry", thrown === 3);

// the registry check and export know the boards per repository
mkdirSync(join(registry, "architecture"), { recursive: true });
writeFileSync(join(registry, "architecture", "broken.json"), JSON.stringify({ nodes: [{ id: "a", block: "nope", x: 0, y: 0 }], edges: [] }));
expect("the registry check reads every board", validateRegistry(registry).some((i) => i.where === "architecture/broken.json" && i.message.includes("unknown block")), JSON.stringify(validateRegistry(registry).filter((i) => i.where.startsWith("arch"))));
expect("an exported project carries the boards per repository, nothing outside them", bundlePathOk("architecture/shop.json") && !bundlePathOk("architecture/../x.json") && !bundlePathOk("architecture/.x.json"));

// the server: a board per repository, the wizard's preview, reset from this computer only
process.env.GARRY_HOME = join(registry, ".garry");
const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { reachableAddresses } = await import("../server/pairing.js");
const devices = new DeviceStore(join(registry, "devices.json"));
const phone = devices.pair(devices.createCode().code, "phone") as { token: string };
const remote = reachableAddresses()[0];
const server = createGarryServer({ registry, skills: join(registry, "none"), routing: join(registry, "none.json"), threads: new ThreadManager(new ThreadStore(join(registry, ".garry"))), hosts: remote ? [remote] : [] }, devices);
await new Promise<void>((r) => server.listen(0, "0.0.0.0", r));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const preview = await post("/api/architecture/wizard", { answers: { clients: ["web", "android"], platform: "supabase", data: "sql", extras: ["files", "email"] } });
const previewed = (await preview.json()) as { architecture: { nodes: { block: string }[]; wizard: WizardAnswers }; issues: { level: string }[] };
expect("POST /api/architecture/wizard builds a preview", preview.status === 200 && previewed.architecture.nodes.some((n) => n.block === "supabase") && previewed.architecture.wizard.platform === "supabase" && !previewed.issues.some((i) => i.level === "error"));
expect("the preview is not saved", readArchitecture(registry, "blog").nodes.length === 0);
expect("a bad answer is a 400", (await post("/api/architecture/wizard", { answers: { clients: ["fax"], platform: "aws", data: "sql" } })).status === 400);
expect("POST ?board= saves that repository's board", (await post("/api/architecture?board=blog", previewed.architecture)).status === 200 && readArchitecture(registry, "blog").wizard?.platform === "supabase");
const got = (await (await fetch(`${base}/api/architecture?board=blog`)).json()) as { board: string; architecture: { nodes: unknown[] }; boards: { id: string }[]; wizard: { platform: { choices: unknown[] } } };
expect("GET ?board= reads it, with the boards and the wizard's questions", got.board === "blog" && got.architecture.nodes.length > 0 && got.boards[0].id === "" && got.wizard.platform.choices.length === WIZARD_PLATFORMS.length);
expect("a board name that leaves the registry is a 400", (await fetch(`${base}/api/architecture?board=..%2Fx`)).status === 400);
expect("another site cannot reset a board", (await fetch(`${base}/api/architecture?board=blog`, { method: "DELETE", headers: { origin: "https://evil.example" } })).status === 403 && readArchitecture(registry, "blog").nodes.length > 0);
if (remote) {
  const r = await fetch(`http://${remote}:${port}/api/architecture?board=blog`, { method: "DELETE", headers: { authorization: `Bearer ${phone.token}` } });
  expect("a paired phone cannot reset a board", r.status === 403 && readArchitecture(registry, "blog").nodes.length > 0);
} else console.log("skip the phone check: no network address to pair from");
expect("this computer resets it", (await fetch(`${base}/api/architecture?board=blog`, { method: "DELETE" })).status === 200 && !existsSync(join(registry, "architecture", "blog.json")) && readArchitecture(registry, "shop").nodes.length > 0);
server.close();

void CAPABILITIES;
if (failed) {
  console.error(`${failed} wizard check(s) failed`);
  process.exit(1);
}
console.log("the architecture wizard and boards behave as expected");
process.exit(0);
