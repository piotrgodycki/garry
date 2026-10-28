import { z } from "zod";

/**
 * Tech stacks: named sets of technologies a team builds with (stacks/<name>.yaml
 * in the registry). Services point at one with stackRef, and agents read it
 * before they touch a repository. The catalog below is what the dashboard
 * offers; its rules catch combinations that do not work together.
 */

export interface Category {
  id: string;
  label: string;
  /** a stack normally has at most one of these */
  single?: boolean;
}

export const CATEGORIES: Category[] = [
  { id: "language", label: "Language" },
  { id: "frontend", label: "UI framework", single: true },
  { id: "mobile", label: "Mobile", single: true },
  { id: "state", label: "State and data fetching" },
  { id: "meta", label: "App framework", single: true },
  { id: "bundler", label: "Bundler", single: true },
  { id: "federation", label: "Microfrontends", single: true },
  { id: "styling", label: "Styling" },
  { id: "runtime", label: "Runtime", single: true },
  { id: "backend", label: "Backend framework", single: true },
  { id: "api", label: "API style" },
  { id: "database", label: "Database" },
  { id: "orm", label: "ORM", single: true },
  { id: "cache", label: "Cache" },
  { id: "queue", label: "Queue and events" },
  { id: "storage", label: "File storage" },
  { id: "cdn", label: "CDN" },
  { id: "auth", label: "Auth", single: true },
  { id: "cms", label: "CMS", single: true },
  { id: "hosting", label: "Hosting" },
  { id: "rendering", label: "Rendering (server and client)" },
  { id: "performance", label: "Performance (server and client)" },
  { id: "testing", label: "Testing and quality" },
  { id: "ci", label: "CI", single: true },
  { id: "observability", label: "Observability" },
];

export interface Tech {
  id: string;
  name: string;
  category: string;
  /** each entry is satisfied by any one of its ids */
  requires?: string[][];
  /** does not work together with these */
  conflicts?: string[];
  /** for rendering and performance: where it happens */
  side?: "server" | "client";
  note?: string;
}

const UI = ["react", "preact", "vue", "svelte", "solid", "angular"];
const EDGE = ["workers", "vercel", "cloudflare", "netlify", "deno"];
const CDNS = ["cf-cdn", "cloudfront", "fastly", "akamai", "bunny", "vercel", "cloudflare", "netlify"];
const SQL = ["postgres", "mysql", "mariadb", "sqlite", "d1", "neon", "supabase"];

export const CATALOG: Tech[] = [
  // language
  { id: "typescript", name: "TypeScript", category: "language" },
  { id: "javascript", name: "JavaScript", category: "language" },
  { id: "python", name: "Python", category: "language" },
  { id: "go", name: "Go", category: "language" },
  { id: "php", name: "PHP", category: "language" },
  { id: "rust", name: "Rust", category: "language" },
  { id: "java", name: "Java", category: "language" },
  { id: "kotlin", name: "Kotlin", category: "language" },
  { id: "swift", name: "Swift", category: "language" },
  { id: "dart", name: "Dart", category: "language" },
  { id: "csharp", name: "C#", category: "language" },
  { id: "ruby", name: "Ruby", category: "language" },
  { id: "elixir", name: "Elixir", category: "language" },
  // UI
  { id: "react", name: "React", category: "frontend" },
  { id: "vue", name: "Vue", category: "frontend" },
  { id: "svelte", name: "Svelte", category: "frontend" },
  { id: "angular", name: "Angular", category: "frontend", requires: [["typescript"]] },
  { id: "solid", name: "SolidJS", category: "frontend" },
  { id: "preact", name: "Preact", category: "frontend" },
  // mobile
  { id: "react-native", name: "React Native", category: "mobile", requires: [["react"]] },
  { id: "expo", name: "Expo", category: "meta", requires: [["react-native"]], note: "React Native with builds, updates and native modules handled for you" },
  { id: "swiftui", name: "SwiftUI", category: "mobile", requires: [["swift"]], note: "iPhone, iPad and Mac apps" },
  { id: "jetpack-compose", name: "Jetpack Compose", category: "mobile", requires: [["kotlin"]], note: "Android apps" },
  { id: "flutter", name: "Flutter", category: "mobile", requires: [["dart"]], note: "one codebase for iPhone and Android" },
  // state and data fetching
  { id: "zustand", name: "Zustand", category: "state", requires: [["react", "preact"]] },
  { id: "redux", name: "Redux Toolkit", category: "state" },
  { id: "jotai", name: "Jotai", category: "state", requires: [["react", "preact"]] },
  { id: "mobx", name: "MobX", category: "state" },
  { id: "pinia", name: "Pinia", category: "state", requires: [["vue"]] },
  { id: "signals", name: "Preact Signals", category: "state", requires: [["preact", "react"]] },
  { id: "xstate", name: "XState", category: "state" },
  { id: "nanostores", name: "Nano Stores", category: "state" },
  { id: "tanstack-query", name: "TanStack Query", category: "state", requires: [UI] },
  { id: "tanstack-router", name: "TanStack Router", category: "state", requires: [["react", "solid"]], note: "type-safe routing" },
  { id: "swr", name: "SWR", category: "state", requires: [["react", "preact"]] },
  // app frameworks
  { id: "nextjs", name: "Next.js", category: "meta", requires: [["react"]], conflicts: ["vite", "module-federation"], note: "brings its own bundler; Module Federation is not supported" },
  { id: "react-router", name: "React Router (framework)", category: "meta", requires: [["react"]] },
  { id: "nuxt", name: "Nuxt", category: "meta", requires: [["vue"]] },
  { id: "sveltekit", name: "SvelteKit", category: "meta", requires: [["svelte"]] },
  { id: "astro", name: "Astro", category: "meta" },
  { id: "remix", name: "Remix", category: "meta", requires: [["react"]], note: "carried on as React Router's framework mode" },
  { id: "tanstack-start", name: "TanStack Start", category: "meta", requires: [["react", "solid"], ["vite"]], conflicts: ["nextjs"] },
  // bundlers
  { id: "vite", name: "Vite", category: "bundler" },
  { id: "webpack", name: "Webpack", category: "bundler" },
  { id: "rspack", name: "Rspack", category: "bundler" },
  { id: "esbuild", name: "esbuild", category: "bundler" },
  // microfrontends
  { id: "module-federation", name: "Module Federation 2", category: "federation", requires: [["vite", "webpack", "rspack"]] },
  { id: "single-spa", name: "single-spa", category: "federation" },
  // styling
  { id: "tailwind", name: "Tailwind CSS", category: "styling" },
  { id: "css-modules", name: "CSS Modules", category: "styling" },
  { id: "styled-components", name: "styled-components", category: "styling", requires: [["react"]] },
  // runtimes
  { id: "node", name: "Node.js", category: "runtime" },
  { id: "bun", name: "Bun", category: "runtime" },
  { id: "deno", name: "Deno", category: "runtime" },
  { id: "workers", name: "Cloudflare Workers", category: "runtime", note: "V8 isolates: no native Node modules, no TCP servers" },
  { id: "php-fpm", name: "PHP-FPM", category: "runtime", requires: [["php"]] },
  { id: "python-runtime", name: "CPython", category: "runtime", requires: [["python"]] },
  { id: "jvm", name: "JVM", category: "runtime", requires: [["java", "kotlin"]] },
  { id: "dotnet", name: ".NET", category: "runtime", requires: [["csharp"]] },
  { id: "beam", name: "Erlang VM (BEAM)", category: "runtime", requires: [["elixir"]] },
  // backend frameworks
  { id: "fastify", name: "Fastify", category: "backend", requires: [["node", "bun"]] },
  { id: "express", name: "Express", category: "backend", requires: [["node", "bun"]] },
  { id: "hono", name: "Hono", category: "backend", requires: [["node", "bun", "deno", "workers"]] },
  { id: "nestjs", name: "NestJS", category: "backend", requires: [["node", "bun"], ["typescript"]] },
  { id: "fastapi", name: "FastAPI", category: "backend", requires: [["python"]] },
  { id: "django", name: "Django", category: "backend", requires: [["python"]] },
  { id: "laravel", name: "Laravel", category: "backend", requires: [["php"]] },
  { id: "spring-boot", name: "Spring Boot", category: "backend", requires: [["jvm"]] },
  { id: "quarkus", name: "Quarkus", category: "backend", requires: [["jvm"]] },
  { id: "gin", name: "Gin", category: "backend", requires: [["go"]] },
  { id: "aspnet", name: "ASP.NET Core", category: "backend", requires: [["dotnet"]] },
  { id: "rails", name: "Ruby on Rails", category: "backend", requires: [["ruby"]] },
  { id: "phoenix", name: "Phoenix", category: "backend", requires: [["beam"]] },
  // API style
  { id: "rest", name: "REST (OpenAPI)", category: "api" },
  { id: "graphql", name: "GraphQL", category: "api" },
  { id: "trpc", name: "tRPC", category: "api", requires: [["typescript"]] },
  { id: "grpc", name: "gRPC", category: "api" },
  // databases
  { id: "postgres", name: "PostgreSQL", category: "database" },
  { id: "mysql", name: "MySQL", category: "database" },
  { id: "mariadb", name: "MariaDB", category: "database" },
  { id: "sqlite", name: "SQLite", category: "database" },
  { id: "d1", name: "Cloudflare D1", category: "database", requires: [["workers"]], note: "SQLite at the edge, reached from Workers" },
  { id: "neon", name: "Neon (serverless Postgres)", category: "database" },
  { id: "supabase", name: "Supabase", category: "database" },
  { id: "mongodb", name: "MongoDB", category: "database" },
  { id: "dynamodb", name: "Amazon DynamoDB", category: "database" },
  // ORM
  { id: "prisma", name: "Prisma", category: "orm", requires: [[...SQL, "mongodb"]] },
  { id: "drizzle", name: "Drizzle", category: "orm", requires: [SQL] },
  { id: "typeorm", name: "TypeORM", category: "orm", requires: [SQL] },
  { id: "mongoose", name: "Mongoose", category: "orm", requires: [["mongodb"]] },
  { id: "sqlalchemy", name: "SQLAlchemy", category: "orm", requires: [["python"], SQL] },
  { id: "efcore", name: "Entity Framework Core", category: "orm", requires: [["csharp"], SQL] },
  // cache
  { id: "redis", name: "Redis", category: "cache" },
  { id: "valkey", name: "Valkey", category: "cache" },
  { id: "upstash", name: "Upstash Redis", category: "cache" },
  { id: "kv", name: "Cloudflare KV", category: "cache", requires: [["workers"]] },
  { id: "memcached", name: "Memcached", category: "cache" },
  // queues
  { id: "sqs", name: "Amazon SQS", category: "queue" },
  { id: "kafka", name: "Kafka", category: "queue" },
  { id: "rabbitmq", name: "RabbitMQ", category: "queue" },
  { id: "bullmq", name: "BullMQ", category: "queue", requires: [["redis", "valkey", "upstash"], ["node", "bun"]] },
  { id: "cf-queues", name: "Cloudflare Queues", category: "queue", requires: [["workers"]] },
  { id: "celery", name: "Celery", category: "queue", requires: [["python"], ["redis", "valkey", "rabbitmq"]] },
  { id: "sidekiq", name: "Sidekiq", category: "queue", requires: [["ruby"], ["redis", "valkey"]] },
  // storage
  { id: "s3", name: "Amazon S3", category: "storage" },
  { id: "r2", name: "Cloudflare R2", category: "storage" },
  { id: "vercel-blob", name: "Vercel Blob", category: "storage" },
  // CDN
  { id: "cf-cdn", name: "Cloudflare CDN", category: "cdn" },
  { id: "cloudfront", name: "Amazon CloudFront", category: "cdn" },
  { id: "fastly", name: "Fastly", category: "cdn" },
  { id: "akamai", name: "Akamai", category: "cdn" },
  { id: "bunny", name: "Bunny CDN", category: "cdn" },
  // auth
  { id: "authjs", name: "Auth.js", category: "auth" },
  { id: "clerk", name: "Clerk", category: "auth" },
  { id: "cognito", name: "Amazon Cognito", category: "auth" },
  { id: "supabase-auth", name: "Supabase Auth", category: "auth" },
  { id: "keycloak", name: "Keycloak", category: "auth" },
  // CMS
  { id: "wordpress", name: "WordPress", category: "cms", requires: [["php"], ["mysql", "mariadb"]], conflicts: ["vercel", "workers"], note: "needs PHP and MySQL hosting; Vercel and Workers do not run it" },
  { id: "strapi", name: "Strapi", category: "cms", requires: [["node"]] },
  { id: "payload", name: "Payload", category: "cms", requires: [["node"]] },
  { id: "sanity", name: "Sanity", category: "cms" },
  { id: "contentful", name: "Contentful", category: "cms" },
  { id: "hygraph", name: "Hygraph", category: "cms", note: "headless, GraphQL first" },
  { id: "aem", name: "Adobe Experience Manager", category: "cms", requires: [["java"]], note: "AEM as a Cloud Service or on premise; Java (Sling, OSGi) components" },
  { id: "eds", name: "Adobe Edge Delivery Services", category: "cms", note: "document based authoring, served from Adobe's edge; plain JS and CSS blocks" },
  // hosting
  { id: "vercel", name: "Vercel", category: "hosting" },
  { id: "cloudflare", name: "Cloudflare Pages", category: "hosting" },
  { id: "netlify", name: "Netlify", category: "hosting" },
  { id: "aws-lambda", name: "AWS Lambda", category: "hosting" },
  { id: "aws-ecs", name: "AWS ECS (Fargate)", category: "hosting" },
  { id: "fly", name: "Fly.io", category: "hosting" },
  { id: "kubernetes", name: "Kubernetes", category: "hosting" },
  { id: "vps", name: "VPS (Docker)", category: "hosting" },
  { id: "apache", name: "Apache HTTP Server", category: "hosting" },
  { id: "nginx", name: "nginx", category: "hosting" },
  // rendering
  { id: "csr", name: "Client-side rendering (SPA)", category: "rendering", side: "client", conflicts: ["rsc"], note: "server components need a server" },
  { id: "ssr", name: "Server-side rendering", category: "rendering", side: "server" },
  { id: "streaming-ssr", name: "Streaming SSR", category: "rendering", side: "server", requires: [["react", "vue", "svelte", "solid"]] },
  { id: "ssg", name: "Static generation (SSG)", category: "rendering", side: "server" },
  { id: "isr", name: "Incremental regeneration (ISR)", category: "rendering", side: "server", requires: [["nextjs", "nuxt", "sveltekit", "astro"]] },
  { id: "rsc", name: "React Server Components", category: "rendering", side: "server", requires: [["react"], ["nextjs", "react-router"]] },
  { id: "ppr", name: "Partial prerendering", category: "rendering", side: "server", requires: [["nextjs"]] },
  { id: "islands", name: "Islands (partial hydration)", category: "rendering", side: "client", requires: [["astro"]] },
  { id: "edge-rendering", name: "Edge rendering", category: "rendering", side: "server", requires: [EDGE] },
  // performance
  { id: "http-caching", name: "HTTP caching (Cache-Control, ETag)", category: "performance", side: "server" },
  { id: "edge-caching", name: "Edge caching", category: "performance", side: "server", requires: [CDNS] },
  { id: "swr-caching", name: "stale-while-revalidate", category: "performance", side: "server" },
  { id: "compression", name: "Brotli compression", category: "performance", side: "server" },
  { id: "db-pooling", name: "Connection pooling", category: "performance", side: "server", requires: [[...SQL, "mongodb"]] },
  { id: "query-cache", name: "Query result cache", category: "performance", side: "server", requires: [["redis", "valkey", "upstash", "kv", "memcached"]] },
  { id: "code-splitting", name: "Code splitting", category: "performance", side: "client" },
  { id: "lazy-loading", name: "Lazy loading", category: "performance", side: "client" },
  { id: "prefetching", name: "Prefetching", category: "performance", side: "client" },
  { id: "image-optimization", name: "Image optimization", category: "performance", side: "client" },
  { id: "service-worker", name: "Service worker (PWA)", category: "performance", side: "client" },
  { id: "web-vitals", name: "Core Web Vitals budgets", category: "performance", side: "client" },
  // testing and quality
  { id: "vitest", name: "Vitest", category: "testing" },
  { id: "jest", name: "Jest", category: "testing" },
  { id: "playwright", name: "Playwright", category: "testing" },
  { id: "cypress", name: "Cypress", category: "testing" },
  { id: "pytest", name: "pytest", category: "testing", requires: [["python"]] },
  { id: "junit", name: "JUnit", category: "testing", requires: [["java", "kotlin"]] },
  { id: "tsc", name: "TypeScript checks (tsc)", category: "testing", requires: [["typescript"]] },
  { id: "zod", name: "Zod", category: "testing", requires: [["typescript", "javascript"]], note: "runtime validation of inputs and contracts" },
  { id: "valibot", name: "Valibot", category: "testing", requires: [["typescript", "javascript"]] },
  { id: "pydantic", name: "Pydantic", category: "testing", requires: [["python"]], note: "runtime validation of inputs and contracts" },
  { id: "oxlint", name: "Oxlint", category: "testing", requires: [["typescript", "javascript"]] },
  { id: "eslint", name: "ESLint", category: "testing", requires: [["typescript", "javascript"]] },
  { id: "biome", name: "Biome", category: "testing", requires: [["typescript", "javascript"]] },
  { id: "prettier", name: "Prettier", category: "testing" },
  // CI
  { id: "github-actions", name: "GitHub Actions", category: "ci" },
  { id: "gitlab-ci", name: "GitLab CI", category: "ci" },
  { id: "circleci", name: "CircleCI", category: "ci" },
  { id: "jenkins", name: "Jenkins", category: "ci" },
  { id: "azure-pipelines", name: "Azure Pipelines", category: "ci" },
  { id: "bitbucket-pipelines", name: "Bitbucket Pipelines", category: "ci" },
  { id: "buildkite", name: "Buildkite", category: "ci" },
  // observability
  { id: "sentry", name: "Sentry", category: "observability" },
  { id: "opentelemetry", name: "OpenTelemetry", category: "observability" },
  { id: "datadog", name: "Datadog", category: "observability" },
];

const BY_ID = new Map(CATALOG.map((t) => [t.id, t]));
export const techById = (id: string): Tech | undefined => BY_ID.get(id);

export const StackTechSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.string().optional(),
});

export const StackSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/, "lowercase letters, digits and dashes"),
  description: z.string().max(500).optional(),
  technologies: z.array(StackTechSchema).min(1, "pick at least one technology"),
});
export type Stack = z.infer<typeof StackSchema>;

export interface StackIssue {
  level: "error" | "warn" | "info";
  tech?: string;
  message: string;
}

const nameOf = (id: string) => BY_ID.get(id)?.name ?? id;

/** What does not fit in a set of technologies: conflicts, missing pieces, doubles. */
export function checkStack(ids: string[]): StackIssue[] {
  const issues: StackIssue[] = [];
  const have = new Set(ids);
  for (const id of have) {
    const t = BY_ID.get(id);
    if (!t) {
      issues.push({ level: "info", tech: id, message: `${id} is not in Garry's catalog; it is kept as written` });
      continue;
    }
    for (const c of t.conflicts ?? []) {
      // report each pair once
      if (have.has(c) && (id < c || !BY_ID.get(c)?.conflicts?.includes(id)))
        issues.push({ level: "error", tech: id, message: `${t.name} and ${nameOf(c)} do not work together${t.note ? `: ${t.note}` : ""}` });
    }
    for (const group of t.requires ?? []) {
      if (!group.some((g) => have.has(g)))
        issues.push({ level: "warn", tech: id, message: `${t.name} needs ${group.map(nameOf).join(" or ")}` });
    }
  }
  for (const cat of CATEGORIES.filter((c) => c.single)) {
    const picked = [...have].filter((id) => BY_ID.get(id)?.category === cat.id);
    if (picked.length > 1) issues.push({ level: "warn", message: `more than one ${cat.label.toLowerCase()}: ${picked.map(nameOf).join(", ")}` });
  }
  return issues;
}

/** The readable one-line stack string a service manifest carries. */
export const stackLine = (s: Pick<Stack, "technologies">): string =>
  s.technologies.map((t) => `${nameOf(t.id)}${t.version ? ` ${t.version}` : ""}`).join(" + ");
