import type { Architecture, Capability } from "./architecture.js";

/**
 * Ready-made architectures for the board: common, sound setups to start from
 * and change. Every one passes the board's rules with nothing to say (the
 * architecture test checks that).
 */

export interface ArchitectureTemplate {
  id: string;
  name: string;
  summary: string;
  /** what it suits, in a few words */
  goodFor: string;
  architecture: Architecture;
}

type Spec = {
  id: string;
  name: string;
  summary: string;
  goodFor: string;
  /** columns left to right: [node id, block, label?] */
  columns: [string, string, string?][][];
  /** need -> provider */
  links: [string, string, Capability][];
};

// wide enough between columns for the relation labels
const COL = 480;
const ROW = 170;

const build = (t: Spec): ArchitectureTemplate => ({
  id: t.id,
  name: t.name,
  summary: t.summary,
  goodFor: t.goodFor,
  architecture: {
    nodes: t.columns.flatMap((col, x) => col.map(([id, block, label], y) => ({ id, block, ...(label ? { label } : {}), x: x * COL, y: y * ROW - ((col.length - 1) * ROW) / 2 }))),
    edges: t.links.map(([from, to, capability]) => ({ from, to, capability })),
  },
});

export const ARCHITECTURE_TEMPLATES: ArchitectureTemplate[] = [
  {
    id: "aem-edge-delivery",
    name: "AEM with Edge Delivery",
    summary: "Pages from Edge Delivery Services with content authored in AEM Sites, assets in AEM Assets, APIs on App Builder.",
    goodFor: "enterprise marketing sites and commerce storefronts on Adobe",
    columns: [
      [["browser", "browser", "Visitors"]],
      [["site", "aem-eds", "Website"]],
      [
        ["aem", "aem-sites", "Authoring"],
        ["api", "adobe-app-builder", "API actions"],
      ],
      [
        ["assets", "aem-assets"],
        ["events", "adobe-io-events"],
      ],
    ],
    links: [
      ["browser", "site", "web"],
      ["site", "aem", "content"],
      ["browser", "api", "http"],
      ["api", "aem", "content"],
      ["api", "assets", "blob"],
      ["api", "events", "events"],
    ],
  },
  {
    id: "aem-cloud-service",
    name: "AEM Sites: Author, Publish, Dispatcher, CDN",
    summary: "The classic AEM as a Cloud Service setup: authors on Author, pages from Publish behind the Dispatcher and Adobe's CDN, assets in AEM Assets.",
    goodFor: "enterprise sites with many authors, workflows and translations",
    columns: [
      [["browser", "browser", "Visitors"]],
      [["cdn", "adobe-cdn"]],
      [["dispatcher", "aem-dispatcher"]],
      [["publish", "aem-publish"]],
      [
        ["author", "aem-author"],
        ["assets", "aem-assets"],
      ],
    ],
    links: [
      ["browser", "cdn", "web"],
      ["cdn", "dispatcher", "web"],
      ["dispatcher", "publish", "web"],
      ["publish", "author", "content"],
      ["publish", "assets", "blob"],
    ],
  },
  {
    id: "aem-own-cdn",
    name: "AEM behind your own CDN",
    summary: "AEM with Akamai in front of Adobe's CDN for your WAF, rules and domains, and a reverse proxy for the apps beside it.",
    goodFor: "enterprises with a CDN contract and security rules of their own",
    columns: [
      [["browser", "browser", "Visitors"]],
      [["edge", "akamai"]],
      [
        ["cdn", "adobe-cdn"],
        ["proxy", "reverse-proxy", "Apps proxy"],
      ],
      [
        ["dispatcher", "aem-dispatcher"],
        ["apps", "kubernetes", "Other apps"],
      ],
      [["publish", "aem-publish"]],
      [["author", "aem-author"]],
    ],
    links: [
      ["browser", "edge", "web"],
      ["edge", "cdn", "web"],
      ["edge", "proxy", "web"],
      ["cdn", "dispatcher", "web"],
      ["proxy", "apps", "web"],
      ["dispatcher", "publish", "web"],
      ["publish", "author", "content"],
    ],
  },
  {
    id: "eds-documents",
    name: "Edge Delivery from documents",
    summary: "A fast site written as documents (Document Authoring, SharePoint or Google Drive) and served by Edge Delivery Services.",
    goodFor: "content sites that authors run on their own, top Core Web Vitals",
    columns: [
      [["browser", "browser", "Visitors"]],
      [["site", "aem-eds", "Website"]],
      [["docs", "aem-da", "Pages as documents"]],
    ],
    links: [
      ["browser", "site", "web"],
      ["site", "docs", "content"],
    ],
  },
  {
    id: "vercel-nextjs",
    name: "Next.js on Vercel",
    summary: "The app on Vercel with a serverless Postgres, sign in, a headless CMS and email.",
    goodFor: "product sites and SaaS, small teams",
    columns: [
      [["browser", "browser", "Visitors"]],
      [["app", "vercel-app", "Web app"]],
      [
        ["db", "neon", "Database"],
        ["auth", "clerk"],
        ["cms", "sanity"],
        ["mail", "resend"],
      ],
    ],
    links: [
      ["browser", "app", "web"],
      ["app", "db", "sql"],
      ["app", "auth", "auth"],
      ["app", "cms", "content"],
      ["app", "mail", "email"],
    ],
  },
  {
    id: "cloudflare-edge",
    name: "Full stack on Cloudflare",
    summary: "Everything at the edge: Workers behind the CDN, with D1, KV, R2 and Queues bound to them.",
    goodFor: "fast and cheap at any scale, global users",
    columns: [
      [["browser", "browser", "Visitors"]],
      [["cdn", "cf-cdn"]],
      [["worker", "cf-workers", "API and pages"]],
      [
        ["db", "cf-d1"],
        ["cache", "cf-kv"],
        ["files", "cf-r2"],
        ["jobs", "cf-queues"],
      ],
    ],
    links: [
      ["browser", "cdn", "web"],
      ["cdn", "worker", "web"],
      ["worker", "db", "sql"],
      ["worker", "cache", "cache"],
      ["worker", "files", "blob"],
      ["worker", "jobs", "queue"],
    ],
  },
  {
    id: "aws-serverless",
    name: "Serverless on AWS",
    summary: "A static site on S3 behind CloudFront, an API on API Gateway and Lambda, DynamoDB, Cognito and SQS.",
    goodFor: "teams on AWS, spiky traffic, a web and a mobile app",
    columns: [
      [
        ["browser", "browser", "Web"],
        ["phone", "mobile-app", "Mobile app"],
      ],
      [
        ["cdn", "aws-cloudfront"],
        ["api", "aws-api-gateway"],
      ],
      [
        ["site", "aws-s3-site", "Static site"],
        ["fn", "aws-lambda", "API functions"],
      ],
      [
        ["db", "aws-dynamodb"],
        ["auth", "aws-cognito"],
        ["jobs", "aws-sqs"],
        ["files", "aws-s3"],
        ["mail", "aws-ses"],
      ],
    ],
    links: [
      ["browser", "cdn", "web"],
      ["cdn", "site", "web"],
      ["phone", "api", "http"],
      ["api", "fn", "compute"],
      ["fn", "db", "document"],
      ["fn", "auth", "auth"],
      ["fn", "jobs", "queue"],
      ["fn", "files", "blob"],
      ["fn", "mail", "email"],
    ],
  },
  {
    id: "wordpress",
    name: "WordPress",
    summary: "Classic WordPress with MySQL and Redis for the object cache, behind Cloudflare.",
    goodFor: "content sites and blogs, editors who know WordPress",
    columns: [
      [["browser", "browser", "Visitors"]],
      [["cdn", "cf-cdn"]],
      [["wp", "wordpress"]],
      [
        ["db", "mysql"],
        ["cache", "redis", "Object cache"],
      ],
    ],
    links: [
      ["browser", "cdn", "web"],
      ["cdn", "wp", "web"],
      ["wp", "db", "sql"],
      ["wp", "cache", "cache"],
    ],
  },
  {
    id: "headless-cms",
    name: "Headless CMS site",
    summary: "A static or server-rendered site on Netlify, content from Strapi on Postgres, search by Algolia.",
    goodFor: "marketing sites, editors and developers apart",
    columns: [
      [["browser", "browser", "Visitors"]],
      [["site", "netlify", "Site"]],
      [
        ["cms", "strapi"],
        ["search", "algolia"],
      ],
      [["db", "postgres"]],
    ],
    links: [
      ["browser", "site", "web"],
      ["site", "cms", "content"],
      ["site", "search", "search"],
      ["cms", "db", "sql"],
    ],
  },
  {
    id: "kubernetes",
    name: "Services on Kubernetes",
    summary: "Containers on Kubernetes behind a CDN, with Postgres, Redis, Kafka for events and Keycloak for sign in.",
    goodFor: "larger teams, many services, self-hosted or any cloud",
    columns: [
      [
        ["browser", "browser", "Web"],
        ["phone", "mobile-app", "Mobile app"],
      ],
      [["cdn", "cf-cdn"]],
      [["k8s", "kubernetes", "Services"]],
      [
        ["db", "postgres"],
        ["cache", "redis"],
        ["events", "kafka"],
        ["auth", "keycloak"],
      ],
    ],
    links: [
      ["browser", "cdn", "web"],
      ["cdn", "k8s", "web"],
      ["phone", "k8s", "http"],
      ["k8s", "db", "sql"],
      ["k8s", "cache", "cache"],
      ["k8s", "events", "events"],
      ["k8s", "auth", "auth"],
    ],
  },
  {
    id: "supabase",
    name: "Supabase app",
    summary: "A web app on Vercel with Supabase for the database, sign in and files in one place.",
    goodFor: "first versions and side projects, one backend to learn",
    columns: [
      [
        ["browser", "browser", "Web"],
        ["phone", "mobile-app", "Mobile app"],
      ],
      [["app", "vercel-app", "Web app"]],
      [["supa", "supabase"]],
    ],
    links: [
      ["browser", "app", "web"],
      ["phone", "app", "http"],
      ["app", "supa", "sql"],
      ["app", "supa", "auth"],
      ["app", "supa", "blob"],
    ],
  },
].map((t) => build(t as Spec));

export const templateById = (id: string) => ARCHITECTURE_TEMPLATES.find((t) => t.id === id);
