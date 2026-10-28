import { z } from "zod";

/**
 * Contract Registry schemas (Garry).
 * The registry is the single source of truth: service manifests (catalog/)
 * and cross service contracts (contracts/). Everything is validated with zod
 * so the whole fleet of agents reads one consistent format.
 */

// catalog/ : service manifest

/** consumes: a map from a service name to the list of consumed modules (./Foo) */
export const ConsumesSchema = z.record(z.string(), z.array(z.string()));

/**
 * db: null for a microfrontend. For a backend service it carries its own database
 * (each service owns its data): the engine, the database name and the migrations
 * directory Garry drives.
 */
export const DbSchema = z.union([
  z.null(),
  z.object({
    engine: z.string(),
    name: z.string().optional(),
    migrations: z.string().optional(),
  }),
]);

/** The kind of service, so Garry picks the right adapters and skills. */
export const ServiceKindSchema = z.enum(["mfe-shell", "mfe-remote", "backend"]);

/**
 * api: for a backend service, a reference to its API contract. The OpenAPI (REST)
 * or AsyncAPI (events) document is the cross service contract, the backend
 * equivalent of Module Federation remotes.
 */
export const ApiRefSchema = z.object({
  kind: z.enum(["openapi", "asyncapi"]),
  path: z.string(),
  version: z.string().optional(),
});

export const ServiceManifestSchema = z.object({
  name: z.string(),
  repo: z.string(),
  stack: z.string(),
  /** the stack it is built with: stacks/<stackRef>.yaml */
  stackRef: z.string().optional(),
  kind: ServiceKindSchema.optional(),
  // Structured stack fields, used by the interoperability checks and by the
  // scaffold adapters. Optional so older manifests with only `stack` stay valid.
  framework: z.string().optional(),
  bundler: z.string().optional(),
  federation: z.string().optional(),
  owner: z.string(),
  exposes: z.array(z.string()).default([]),
  consumes: ConsumesSchema.default({}),
  api: ApiRefSchema.optional(),
  db: DbSchema.default(null),
});
export type ServiceManifest = z.infer<typeof ServiceManifestSchema>;

// contracts/ : cross service contracts

/** remotes.json: Module Federation, which service exposes what and from where */
export const RemoteSchema = z.object({
  entry: z.string(),
  exposes: z.array(z.string()),
});
export const RemotesContractSchema = z.record(z.string(), RemoteSchema);
export type RemotesContract = z.infer<typeof RemotesContractSchema>;

/** shared-deps.json: enforced versions of shared dependencies */
export const SharedDepSchema = z.object({
  version: z.string(),
  singleton: z.boolean().default(false),
  requiredVersion: z.string().optional(),
});
export const SharedDepsContractSchema = z.record(z.string(), SharedDepSchema);
export type SharedDepsContract = z.infer<typeof SharedDepsContractSchema>;

/** design-tokens.json: loose for now, the schema will be tightened later */
export const DesignTokensContractSchema = z.record(z.string(), z.any());
export type DesignTokensContract = z.infer<typeof DesignTokensContractSchema>;

/**
 * api.json: the cross service API contract for backend services. Each service
 * declares what it exposes over REST (OpenAPI) or events (AsyncAPI). This is the
 * backend equivalent of remotes.json.
 */
export const ApiServiceSchema = z.object({
  kind: z.enum(["openapi", "asyncapi"]),
  baseUrl: z.string().optional(),
  operations: z.array(z.string()).default([]),
});
export const ApiContractSchema = z.record(z.string(), ApiServiceSchema);
export type ApiContract = z.infer<typeof ApiContractSchema>;

/** events.json: the event bus contract between microfrontends */
export const EventSchema = z.object({
  payload: z.record(z.string(), z.any()),
  producers: z.array(z.string()),
  consumers: z.array(z.string()),
});
export const EventsContractSchema = z.record(z.string(), EventSchema);
export type EventsContract = z.infer<typeof EventsContractSchema>;

// features/ : living feature state (frontmatter)

export const SDLC_STAGES = [
  "spec",
  "plan",
  "design",
  "implement",
  "review",
  "test",
  "integrate",
  "done",
] as const;

export const RoutingOverrideSchema = z.record(
  z.string(),
  z.object({ agent: z.string(), model: z.string() }),
);

export const FeatureFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(SDLC_STAGES),
  services: z.array(z.string()).default([]),
  contractChanges: z.array(z.string()).default([]),
  routingOverride: RoutingOverrideSchema.optional(),
  /** a routing profile: routing/<name>.json */
  routing: z.string().optional(),
});
export type FeatureFrontmatter = z.infer<typeof FeatureFrontmatterSchema>;
