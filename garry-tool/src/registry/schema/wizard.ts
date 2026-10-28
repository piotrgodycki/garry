import { z } from "zod";

/**
 * The architecture wizard's questions and the answers it keeps with the board
 * (architecture.json, "wizard"), so it opens again where it was left.
 */

export const WIZARD_CLIENTS = ["web", "ios", "android"] as const;
export const WIZARD_PLATFORMS = ["vercel", "cloudflare", "aws", "supabase", "adobe", "self-hosted", "kubernetes"] as const;
export const WIZARD_DATA = ["sql", "document", "none"] as const;
export const WIZARD_EXTRAS = ["auth", "cms", "files", "queue", "cache", "search", "email", "cdn", "events"] as const;

export const WizardAnswersSchema = z.object({
  clients: z.array(z.enum(WIZARD_CLIENTS)).min(1, "pick who uses it").max(3),
  platform: z.enum(WIZARD_PLATFORMS),
  data: z.enum(WIZARD_DATA),
  extras: z.array(z.enum(WIZARD_EXTRAS)).max(WIZARD_EXTRAS.length).default([]),
  /** put the registry's services on the board, joined to what they need */
  services: z.boolean().default(true),
});
export type WizardAnswers = z.infer<typeof WizardAnswersSchema>;

/** The questions and their choices, worded for someone new to this; the dashboard shows them as they are. */
export const WIZARD_QUESTIONS = {
  clients: {
    title: "Who uses it?",
    choices: [
      { id: "web", label: "People in a browser", hint: "a website or a web app" },
      { id: "ios", label: "An iPhone app", hint: "iPhone and iPad" },
      { id: "android", label: "An Android app", hint: "phones and tablets" },
    ],
  },
  platform: {
    title: "Where does it run?",
    choices: [
      { id: "vercel", label: "Vercel", hint: "the simplest start for a Next.js app; scales by itself" },
      { id: "cloudflare", label: "Cloudflare", hint: "fast everywhere, at the edge, low cost" },
      { id: "aws", label: "AWS", hint: "the widest choice of services, for teams that already use it" },
      { id: "supabase", label: "Supabase", hint: "database, sign in and files in one, with the app on Vercel" },
      { id: "adobe", label: "Adobe Experience Manager", hint: "AEM with Edge Delivery Services for pages, App Builder for APIs; for enterprise sites" },
      { id: "self-hosted", label: "Your own server", hint: "a VPS with Docker; you run everything" },
      { id: "kubernetes", label: "Kubernetes", hint: "your own cluster, for many services and teams" },
    ],
  },
  data: {
    title: "What data does it keep?",
    choices: [
      { id: "sql", label: "Tables (SQL)", hint: "users, orders, anything with relations; the usual choice" },
      { id: "document", label: "Documents", hint: "flexible records without a fixed shape" },
      { id: "none", label: "None", hint: "it shows content or calls other services" },
    ],
  },
  extras: {
    title: "What else does it need?",
    choices: [
      { id: "auth", label: "Sign in", hint: "accounts, passwords, social login" },
      { id: "cms", label: "Content editing", hint: "a CMS for pages and articles" },
      { id: "files", label: "File uploads", hint: "images, documents" },
      { id: "queue", label: "Background jobs", hint: "work that runs after the request" },
      { id: "cache", label: "A cache", hint: "faster answers for repeated reads" },
      { id: "search", label: "Search", hint: "a search box over your content" },
      { id: "email", label: "Email", hint: "receipts, password resets" },
      { id: "cdn", label: "A CDN in front", hint: "cached pages close to every visitor (for a website or web app)" },
      { id: "events", label: "Events between services", hint: "services that react to each other" },
    ],
  },
} as const;
