import { componentById, serviceBlock, type Architecture, type Capability } from "../registry/schema/architecture.js";
import { WIZARD_EXTRAS, WizardAnswersSchema, type WizardAnswers } from "../registry/schema/wizard.js";

export { WIZARD_QUESTIONS, WizardAnswersSchema, type WizardAnswers } from "../registry/schema/wizard.js";
type Platform = WizardAnswers["platform"];
type Extra = WizardAnswers["extras"][number];

/**
 * The architecture wizard: a few plain questions (who uses it, where it runs,
 * what data it keeps, what else it needs) become a board built from the same
 * blocks as by hand. The answers are kept with the board, so the wizard opens
 * again with them, can be changed and the board rebuilt; the board itself
 * stays editable. Every combination of answers builds a board the rules have
 * no error for (the wizard test checks them all).
 */

/** The block each platform uses for each piece. */
const PICK: Record<Platform, { app: string; sql: string; document: string } & Record<Extra, string>> = {
  vercel: { app: "vercel-app", sql: "neon", document: "mongodb", auth: "clerk", cms: "sanity", files: "vercel-blob", queue: "upstash", cache: "upstash", search: "algolia", email: "resend", cdn: "cf-cdn", events: "kafka" },
  cloudflare: { app: "cf-workers", sql: "cf-d1", document: "mongodb", auth: "clerk", cms: "sanity", files: "cf-r2", queue: "cf-queues", cache: "cf-kv", search: "algolia", email: "resend", cdn: "cf-cdn", events: "kafka" },
  aws: { app: "aws-lambda", sql: "aws-aurora", document: "aws-dynamodb", auth: "aws-cognito", cms: "sanity", files: "aws-s3", queue: "aws-sqs", cache: "aws-elasticache", search: "algolia", email: "aws-ses", cdn: "aws-cloudfront", events: "aws-sns" },
  supabase: { app: "vercel-app", sql: "supabase", document: "mongodb", auth: "supabase", cms: "sanity", files: "supabase", queue: "upstash", cache: "upstash", search: "algolia", email: "resend", cdn: "cf-cdn", events: "kafka" },
  "self-hosted": { app: "vps", sql: "postgres", document: "mongodb", auth: "keycloak", cms: "strapi", files: "cf-r2", queue: "rabbitmq", cache: "redis", search: "algolia", email: "resend", cdn: "cf-cdn", events: "kafka" },
  kubernetes: { app: "kubernetes", sql: "postgres", document: "mongodb", auth: "keycloak", cms: "strapi", files: "cf-r2", queue: "rabbitmq", cache: "redis", search: "algolia", email: "resend", cdn: "cf-cdn", events: "kafka" },
};

const CAP_OF: Record<Extra, Capability> = { auth: "auth", cms: "content", files: "blob", queue: "queue", cache: "cache", search: "search", email: "email", cdn: "cdn", events: "events" };
const LABEL: Record<string, string> = { app: "Your app", api: "API", site: "Static site", db: "Database" };

const COL = 420;
const ROW = 160;

/** Builds the board for a set of answers. services are the registry's manifests (name, kind, db). */
export function buildFromWizard(input: unknown, services: { name: string; kind?: string; db?: unknown }[] = []): Architecture & { wizard: WizardAnswers } {
  const answers = WizardAnswersSchema.parse(input);
  const pick = PICK[answers.platform];
  const extras = new Set(answers.extras);
  const columns: { id: string; block: string; label?: string }[][] = [[], [], [], [], []];
  const edges: Architecture["edges"] = [];
  const byBlock = new Map<string, string>();
  const place = (col: number, id: string, block: string, label?: string) => {
    if (!componentById(block) && !block.startsWith("service:")) throw new Error(`the wizard names an unknown block ${block}`);
    const existing = byBlock.get(block);
    if (existing && !block.startsWith("service:")) return existing;
    // an id is never shared: a second block wanting one gets a number after it
    const taken = (x: string) => columns.some((c) => c.some((n) => n.id === x));
    for (let k = 2; taken(id); k++) id = `${id.replace(/-\d+$/, "")}-${k}`;
    columns[col].push({ id, block, ...(label ? { label } : {}) });
    byBlock.set(block, id);
    return id;
  };
  const link = (from: string, to: string, capability: Capability) => {
    if (!edges.some((e) => e.from === from && e.to === to && e.capability === capability)) edges.push({ from, to, capability });
  };

  // who uses it
  const web = answers.clients.includes("web");
  const phones = answers.clients.filter((c) => c !== "web");
  if (web) place(0, "browser", "browser", "Visitors");
  if (phones.includes("ios")) place(0, "ios", "ios-app");
  if (phones.includes("android")) place(0, "android", "android-app");

  // the app, and how requests reach it
  let compute: string;
  let api: string;
  if (answers.platform === "aws") {
    compute = place(2, "app", pick.app, "API functions");
    if (web) {
      const site = place(2, "site", "aws-s3-site", LABEL.site);
      const cdn = place(1, "cdn", "aws-cloudfront");
      link("browser", cdn, "web");
      link(cdn, site, "web");
    }
    api = place(1, "api", "aws-api-gateway", LABEL.api);
    link(api, compute, "compute");
    if (web) link("browser", api, "http");
  } else {
    compute = place(2, "app", pick.app, LABEL.app);
    api = compute;
    if (web) {
      if (extras.has("cdn")) {
        const cdn = place(1, "cdn", pick.cdn);
        link("browser", cdn, "web");
        link(cdn, compute, "web");
      } else link("browser", compute, "web");
    }
  }
  for (const p of phones) link(p, api, "http");

  // the data it keeps
  let sql: string | null = null;
  if (answers.data === "sql") {
    sql = place(4, "db", pick.sql, LABEL.db);
    link(compute, sql, "sql");
  } else if (answers.data === "document") {
    const doc = place(4, "docs", pick.document, "Documents");
    link(compute, doc, "document");
  }
  // a database for what needs one even when the app keeps none (a self-hosted CMS)
  const needSql = () => sql ?? (sql = place(4, "db", pick.sql, LABEL.db));

  // the rest
  for (const extra of WIZARD_EXTRAS) {
    if (!extras.has(extra) || extra === "cdn") continue;
    const block = pick[extra];
    const id = place(4, extra, block);
    link(compute, id, CAP_OF[extra]);
    for (const need of componentById(block)?.needs ?? []) if (need === "sql") link(id, needSql(), "sql");
  }

  // your services, joined to what they need
  if (answers.services) {
    const placed = services.map((s) => ({ s, b: serviceBlock(s), id: place(3, `svc-${s.name}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64), `service:${s.name}`) }));
    const providerOf = (cap: Capability, self: string): string | null => {
      // another of your services first (a shell's microfrontends, a BFF's API), then the platform
      const own = placed.find((p) => p.id !== self && p.b.provides.includes(cap));
      if (own) return own.id;
      if (cap === "compute") return compute;
      if (cap === "http") return api;
      if (cap === "sql") return needSql();
      if (cap === "queue") {
        const id = place(4, "queue", pick.queue);
        link(compute, id, "queue");
        return id;
      }
      return null;
    };
    for (const p of placed) for (const need of p.b.needs ?? []) {
      const to = providerOf(need, p.id);
      if (to) link(p.id, to, need);
    }
    // what serves pages takes the visitors for them
    for (const p of placed) if (p.b.provides.includes("web") && web) link("browser", p.id, "web");
  }

  const nodes = columns
    .filter((col) => col.length)
    .flatMap((col, x) => col.map((n, y) => ({ ...n, x: x * COL, y: y * ROW - ((col.length - 1) * ROW) / 2 })));
  return { nodes, edges, wizard: answers };
}
