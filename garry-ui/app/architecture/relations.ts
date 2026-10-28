import type { ArchBlock } from "garry-client";

/**
 * What a link on the board means, in words: the block that needs (from) and
 * what it gets from the block that provides (to). A block that offers the
 * very thing it passes on (a CDN in front of an origin, Hyperdrive in front of
 * Postgres) or that forwards requests to code (API Gateway to Lambda) is a
 * proxy, and says so.
 */
export interface Relation {
  /** a short verb phrase: "reads & writes", "runs on" */
  verb: string;
  proxy: boolean;
}

const VERBS: Record<string, string> = {
  web: "loads from",
  http: "calls",
  module: "loads module from",
  sql: "reads & writes",
  document: "stores documents in",
  kv: "stores keys in",
  cache: "caches in",
  queue: "queues jobs on",
  events: "publishes events to",
  blob: "stores files in",
  auth: "signs in with",
  cdn: "is served by",
  content: "pulls content from",
  email: "sends email via",
  search: "searches with",
  compute: "runs on",
};

export function relationOf(from: ArchBlock | undefined, capability: string): Relation {
  // passes on what it offers itself: a CDN fetching the origin, a pooler in front of a database
  if (from?.provides.includes(capability)) return { verb: capability === "web" ? "forwards traffic to" : capability === "sql" ? "pools connections to" : "forwards to", proxy: true };
  // an API in front of code it does not run itself
  if (capability === "compute" && from?.provides.includes("http") && !from.provides.includes("compute")) return { verb: "forwards requests to", proxy: true };
  return { verb: VERBS[capability] ?? "uses", proxy: false };
}
