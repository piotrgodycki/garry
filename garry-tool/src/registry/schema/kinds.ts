import type { Capability, Component } from "./architecture.js";

/**
 * The kinds of service a registry holds, in one place: how they are named and
 * explained, what they expose, whether they may own a database, the stack a
 * new one starts from, and the block they are on the architecture board.
 */

export const SERVICE_KIND_IDS = ["mfe-remote", "mfe-shell", "spa", "ssr", "isr", "ssg", "mobile", "backend", "bff", "worker", "function"] as const;
export type ServiceKind = (typeof SERVICE_KIND_IDS)[number];

export interface ServiceKindInfo {
  id: ServiceKind;
  label: string;
  group: "Frontend" | "Backend";
  /** one line, for a beginner */
  hint: string;
  /** what "exposes" means for it; null when it exposes nothing others use */
  exposes: { label: string; placeholder: string } | null;
  /** may own a database */
  db: boolean;
  /** the stack a new one starts from when none is picked */
  stack: string;
  /** on the architecture board */
  block: { group: Component["group"]; provides: Capability[]; needs: Capability[] };
}

const ENDPOINTS = { label: "Endpoints it offers", placeholder: "POST /orders, GET /orders/:id" };

export const SERVICE_KINDS: ServiceKindInfo[] = [
  { id: "mfe-remote", label: "Microfrontend", group: "Frontend", hint: "A part of a page that a shell loads at run time.", exposes: { label: "Modules it exposes", placeholder: "./Checkout, ./CartSummary" }, db: false, stack: "react + vite + module-federation-2", block: { group: "client", provides: ["module"], needs: [] } },
  { id: "mfe-shell", label: "Shell", group: "Frontend", hint: "The host page that loads the microfrontends.", exposes: null, db: false, stack: "react + vite + module-federation-2", block: { group: "client", provides: ["web"], needs: ["module"] } },
  { id: "spa", label: "Single-page app (SPA)", group: "Frontend", hint: "Renders in the browser and calls APIs; served as static files.", exposes: null, db: false, stack: "react + vite", block: { group: "client", provides: ["web"], needs: [] } },
  { id: "ssr", label: "Server-rendered app (SSR)", group: "Frontend", hint: "Pages are rendered on a server for every request.", exposes: null, db: true, stack: "next.js", block: { group: "client", provides: ["web"], needs: ["compute"] } },
  { id: "isr", label: "Static, refreshed pages (ISR)", group: "Frontend", hint: "Pages are built ahead and rebuilt in the background when content changes.", exposes: null, db: true, stack: "next.js", block: { group: "client", provides: ["web"], needs: ["compute"] } },
  { id: "ssg", label: "Static site (SSG)", group: "Frontend", hint: "Every page is built ahead of time; no server needed.", exposes: null, db: false, stack: "astro", block: { group: "client", provides: ["web"], needs: [] } },
  { id: "mobile", label: "Mobile app", group: "Frontend", hint: "An iPhone or Android app that talks to your APIs.", exposes: null, db: false, stack: "expo + react-native", block: { group: "client", provides: [], needs: ["http"] } },
  { id: "backend", label: "API", group: "Backend", hint: "An HTTP API, usually with its own database.", exposes: ENDPOINTS, db: true, stack: "node", block: { group: "compute", provides: ["http"], needs: ["compute"] } },
  { id: "bff", label: "Backend for frontend (BFF)", group: "Backend", hint: "An API made for one frontend; it gathers what that frontend needs from other APIs.", exposes: ENDPOINTS, db: false, stack: "node + fastify", block: { group: "compute", provides: ["http"], needs: ["compute", "http"] } },
  { id: "worker", label: "Worker", group: "Backend", hint: "Runs jobs in the background: from a queue, or on a schedule.", exposes: { label: "Jobs it handles", placeholder: "send-receipt, resize-image" }, db: true, stack: "node + bullmq", block: { group: "compute", provides: [], needs: ["compute", "queue"] } },
  { id: "function", label: "Serverless function", group: "Backend", hint: "A small piece of code run on demand by the platform.", exposes: ENDPOINTS, db: true, stack: "node", block: { group: "compute", provides: ["http"], needs: ["compute"] } },
];

const BY_KIND = new Map(SERVICE_KINDS.map((k) => [k.id, k]));
/** A kind's description; an unknown or missing kind reads as a microfrontend, as registries before kinds were written. */
export const kindInfo = (kind: string | undefined): ServiceKindInfo => BY_KIND.get(kind as ServiceKind) ?? BY_KIND.get("mfe-remote")!;
export const isServiceKind = (kind: string): kind is ServiceKind => BY_KIND.has(kind as ServiceKind);
