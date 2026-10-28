import { z } from "zod";
import { kindInfo } from "./kinds.js";
import { WizardAnswersSchema } from "./wizard.js";

/**
 * The architecture board: blocks (your services and the platforms they run on)
 * joined like puzzle pieces. Every block offers some capabilities (provides)
 * and needs others (needs); a link always goes from a need to a block that
 * provides it, so only fitting pieces snap together. Stored in the registry as
 * architecture.json; checkArchitecture says what is missing or does not fit.
 */

export const CAPABILITIES = {
  web: "Web or app traffic",
  http: "HTTP API",
  module: "Microfrontend module",
  sql: "SQL database",
  document: "Document database",
  kv: "Key value store",
  cache: "Cache",
  queue: "Queue",
  events: "Event stream",
  blob: "File storage",
  auth: "Sign in",
  cdn: "CDN and edge cache",
  content: "CMS content",
  email: "Email",
  search: "Search",
  compute: "Runs code",
} as const;
export type Capability = keyof typeof CAPABILITIES;

export interface Component {
  id: string;
  name: string;
  provider: string;
  group: "client" | "edge" | "compute" | "data" | "messaging" | "storage" | "identity" | "content" | "external";
  provides: Capability[];
  /** what it cannot work without */
  needs?: Capability[];
  /** may only be reached from blocks of these providers (bindings, private networks) */
  reachableFrom?: string[];
  note?: string;
}

export const PROVIDERS = ["Clients", "AWS", "Cloudflare", "Vercel", "Netlify", "Supabase", "Self-hosted", "SaaS"];

export const COMPONENTS: Component[] = [
  // clients
  { id: "browser", name: "Browser", provider: "Clients", group: "client", provides: [], needs: ["web"] },
  { id: "mobile-app", name: "Mobile app", provider: "Clients", group: "client", provides: [], needs: ["http"] },
  { id: "ios-app", name: "iOS app", provider: "Clients", group: "client", provides: [], needs: ["http"], note: "iPhone and iPad" },
  { id: "android-app", name: "Android app", provider: "Clients", group: "client", provides: [], needs: ["http"] },
  // AWS
  { id: "aws-cloudfront", name: "CloudFront", provider: "AWS", group: "edge", provides: ["cdn", "web"], needs: ["web"] },
  { id: "aws-s3-site", name: "S3 static site", provider: "AWS", group: "edge", provides: ["web"] },
  { id: "aws-api-gateway", name: "API Gateway", provider: "AWS", group: "edge", provides: ["http"], needs: ["compute"] },
  { id: "aws-lambda", name: "Lambda", provider: "AWS", group: "compute", provides: ["compute", "http"] },
  { id: "aws-ecs", name: "ECS Fargate", provider: "AWS", group: "compute", provides: ["compute", "http", "web"] },
  { id: "aws-rds-postgres", name: "RDS Postgres", provider: "AWS", group: "data", provides: ["sql"], note: "in a VPC: reach it from AWS compute, or through a proxy and pooling" },
  { id: "aws-aurora", name: "Aurora Serverless", provider: "AWS", group: "data", provides: ["sql"] },
  { id: "aws-dynamodb", name: "DynamoDB", provider: "AWS", group: "data", provides: ["kv", "document"] },
  { id: "aws-elasticache", name: "ElastiCache Redis", provider: "AWS", group: "data", provides: ["cache", "kv"], reachableFrom: ["AWS"], note: "VPC only" },
  { id: "aws-sqs", name: "SQS", provider: "AWS", group: "messaging", provides: ["queue"] },
  { id: "aws-sns", name: "SNS / EventBridge", provider: "AWS", group: "messaging", provides: ["events"] },
  { id: "aws-s3", name: "S3", provider: "AWS", group: "storage", provides: ["blob"] },
  { id: "aws-cognito", name: "Cognito", provider: "AWS", group: "identity", provides: ["auth"] },
  { id: "aws-ses", name: "SES", provider: "AWS", group: "external", provides: ["email"] },
  // Cloudflare
  { id: "cf-cdn", name: "Cloudflare CDN", provider: "Cloudflare", group: "edge", provides: ["cdn", "web"], needs: ["web"] },
  { id: "cf-pages", name: "Pages", provider: "Cloudflare", group: "edge", provides: ["web"] },
  { id: "cf-workers", name: "Workers", provider: "Cloudflare", group: "compute", provides: ["compute", "http", "web"] },
  { id: "cf-d1", name: "D1", provider: "Cloudflare", group: "data", provides: ["sql"], reachableFrom: ["Cloudflare"], note: "a Workers binding" },
  { id: "cf-kv", name: "KV", provider: "Cloudflare", group: "data", provides: ["kv", "cache"], reachableFrom: ["Cloudflare"], note: "a Workers binding" },
  { id: "cf-hyperdrive", name: "Hyperdrive", provider: "Cloudflare", group: "data", provides: ["sql"], needs: ["sql"], reachableFrom: ["Cloudflare"], note: "pools and caches a Postgres or MySQL for Workers" },
  { id: "cf-queues", name: "Queues", provider: "Cloudflare", group: "messaging", provides: ["queue"], reachableFrom: ["Cloudflare"] },
  { id: "cf-r2", name: "R2", provider: "Cloudflare", group: "storage", provides: ["blob"] },
  // Vercel
  { id: "vercel-app", name: "Vercel (Next.js)", provider: "Vercel", group: "compute", provides: ["web", "http", "compute"] },
  { id: "vercel-blob", name: "Vercel Blob", provider: "Vercel", group: "storage", provides: ["blob"] },
  { id: "netlify", name: "Netlify", provider: "Netlify", group: "compute", provides: ["web", "http", "compute"] },
  // Supabase
  { id: "supabase", name: "Supabase", provider: "Supabase", group: "data", provides: ["sql", "auth", "blob"] },
  // self-hosted, anywhere
  { id: "postgres", name: "PostgreSQL", provider: "Self-hosted", group: "data", provides: ["sql"] },
  { id: "mysql", name: "MySQL / MariaDB", provider: "Self-hosted", group: "data", provides: ["sql"] },
  { id: "mongodb", name: "MongoDB", provider: "Self-hosted", group: "data", provides: ["document"] },
  { id: "redis", name: "Redis", provider: "Self-hosted", group: "data", provides: ["cache", "kv", "queue"] },
  { id: "kafka", name: "Kafka", provider: "Self-hosted", group: "messaging", provides: ["events"] },
  { id: "rabbitmq", name: "RabbitMQ", provider: "Self-hosted", group: "messaging", provides: ["queue"] },
  { id: "keycloak", name: "Keycloak", provider: "Self-hosted", group: "identity", provides: ["auth"] },
  { id: "wordpress", name: "WordPress", provider: "Self-hosted", group: "content", provides: ["content", "web"], needs: ["sql"], note: "PHP and MySQL hosting" },
  { id: "strapi", name: "Strapi", provider: "Self-hosted", group: "content", provides: ["content", "http"], needs: ["sql"] },
  { id: "vps", name: "VPS / Docker", provider: "Self-hosted", group: "compute", provides: ["compute", "http", "web"] },
  { id: "kubernetes", name: "Kubernetes", provider: "Self-hosted", group: "compute", provides: ["compute", "http", "web"] },
  // SaaS
  { id: "upstash", name: "Upstash Redis", provider: "SaaS", group: "data", provides: ["cache", "kv", "queue"] },
  { id: "neon", name: "Neon Postgres", provider: "SaaS", group: "data", provides: ["sql"] },
  { id: "clerk", name: "Clerk", provider: "SaaS", group: "identity", provides: ["auth"] },
  { id: "auth0", name: "Auth0", provider: "SaaS", group: "identity", provides: ["auth"] },
  { id: "contentful", name: "Contentful", provider: "SaaS", group: "content", provides: ["content"] },
  { id: "hygraph", name: "Hygraph", provider: "SaaS", group: "content", provides: ["content"] },
  { id: "sanity", name: "Sanity", provider: "SaaS", group: "content", provides: ["content"] },
  { id: "algolia", name: "Algolia", provider: "SaaS", group: "external", provides: ["search"] },
  { id: "resend", name: "Resend", provider: "SaaS", group: "external", provides: ["email"] },
];

/** "Sign in" reads "sign in" mid sentence; "SQL database" stays as it is. */
const lc = (label: string) => (/^[A-Z][A-Z]/.test(label) ? label : label[0].toLowerCase() + label.slice(1));

const BY_ID = new Map(COMPONENTS.map((c) => [c.id, c]));
export const componentById = (id: string): Component | undefined => BY_ID.get(id);

/** A registry service as a block: what its kind offers and needs (a database it owns adds SQL). */
export function serviceBlock(service: { name: string; kind?: string; consumes?: Record<string, string[]>; db?: unknown }): Component {
  const k = kindInfo(service.kind);
  const needs: Capability[] = [...k.block.needs, ...(service.db && k.db ? (["sql"] as Capability[]) : [])];
  return { id: `service:${service.name}`, name: service.name, provider: "Your services", group: k.block.group, provides: [...k.block.provides], ...(needs.length ? { needs } : {}) };
}

const NodeSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  /** a component id, or service:<name> */
  block: z.string().min(1),
  label: z.string().max(80).optional(),
  x: z.number(),
  y: z.number(),
});
const EdgeSchema = z.object({
  /** the block that needs */
  from: z.string(),
  /** the block that provides */
  to: z.string(),
  capability: z.enum(Object.keys(CAPABILITIES) as [Capability, ...Capability[]]),
});
export const ArchitectureSchema = z.object({
  nodes: z.array(NodeSchema).max(300).default([]),
  edges: z.array(EdgeSchema).max(1000).default([]),
  /** the wizard's answers the board was built from, so the wizard opens with them */
  wizard: WizardAnswersSchema.nullable().optional(),
});
export type Architecture = z.infer<typeof ArchitectureSchema>;

export interface ArchitectureIssue {
  level: "error" | "warn" | "info";
  node?: string;
  edge?: number;
  message: string;
}

/** What is missing or does not fit on the board. services are the registry's manifests. */
export function checkArchitecture(arch: Architecture, services: { name: string; kind?: string; db?: unknown }[] = []): ArchitectureIssue[] {
  const issues: ArchitectureIssue[] = [];
  const svc = new Map(services.map((s) => [`service:${s.name}`, serviceBlock(s)]));
  const block = (id: string) => BY_ID.get(id) ?? svc.get(id);
  const nodes = new Map(arch.nodes.map((n) => [n.id, n]));
  const label = (id: string) => {
    const n = nodes.get(id);
    return n?.label || (n && block(n.block)?.name) || id;
  };

  for (const n of arch.nodes) if (!block(n.block)) issues.push({ level: "error", node: n.id, message: `${n.label ?? n.block}: unknown block ${n.block}` });

  arch.edges.forEach((e, i) => {
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (!from || !to) return issues.push({ level: "error", edge: i, message: "a link points at a block that is not on the board" });
    const fb = block(from.block);
    const tb = block(to.block);
    if (!fb || !tb) return;
    if (!tb.provides.includes(e.capability)) issues.push({ level: "error", edge: i, message: `${label(to.id)} does not provide ${lc(CAPABILITIES[e.capability])}` });
    if (tb.reachableFrom && !tb.reachableFrom.includes(fb.provider) && fb.provider !== "Your services")
      issues.push({ level: "error", edge: i, message: `${label(to.id)} is only reachable from ${tb.reachableFrom.join(" or ")}${tb.note ? ` (${tb.note})` : ""}, not from ${label(from.id)}` });
    // a service reaching a binding-only block must run on that provider
    if (tb.reachableFrom && fb.provider === "Your services") {
      const hosts = arch.edges.filter((x) => x.from === from.id && x.capability === "compute").map((x) => block(nodes.get(x.to)?.block ?? ""));
      if (hosts.length && !hosts.some((h) => h && tb.reachableFrom!.includes(h.provider)))
        issues.push({ level: "error", edge: i, message: `${label(to.id)} is only reachable from ${tb.reachableFrom.join(" or ")}, and ${label(from.id)} runs elsewhere` });
    }
    if (e.capability === "sql" && tb.id === "aws-rds-postgres" && fb.provider !== "AWS" && fb.provider !== "Your services")
      issues.push({ level: "warn", edge: i, message: `${label(from.id)} reaching RDS from outside AWS: add pooling (RDS Proxy, Hyperdrive) and keep it private` });
  });

  for (const n of arch.nodes) {
    const b = block(n.block);
    if (!b) continue;
    const linked = new Set(arch.edges.filter((e) => e.from === n.id).map((e) => e.capability));
    for (const need of b.needs ?? []) {
      if (!linked.has(need)) issues.push({ level: "warn", node: n.id, message: `${label(n.id)} needs ${lc(CAPABILITIES[need])}: link it to a block that provides it` });
    }
    if (!arch.edges.some((e) => e.from === n.id || e.to === n.id) && arch.nodes.length > 1) issues.push({ level: "info", node: n.id, message: `${label(n.id)} is not linked to anything` });
  }

  // one database for everything is a single point of failure only when nothing else is there; keep it a hint
  const sqlTargets = new Set(arch.edges.filter((e) => e.capability === "sql").map((e) => e.to));
  if (sqlTargets.size === 1 && arch.edges.filter((e) => e.capability === "sql").length >= 3)
    issues.push({ level: "info", node: [...sqlTargets][0], message: `every service shares ${label([...sqlTargets][0])}: fine to start, a coupling point later` });

  for (const s of services) if (!arch.nodes.some((n) => n.block === `service:${s.name}`)) issues.push({ level: "info", message: `${s.name} is in the registry but not on the board` });
  return issues;
}
