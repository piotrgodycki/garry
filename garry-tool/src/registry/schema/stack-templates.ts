import type { ServiceKind } from "./kinds.js";

/**
 * Ready-made stacks: well known combinations a team can start from, then change.
 * Each one passes the stack rules as it is, and says which kinds of service it
 * suits so the Add service form can offer the right ones first.
 */

export interface StackTemplate {
  name: string;
  title: string;
  description: string;
  /** the kinds of service it is meant for */
  kinds: ServiceKind[];
  technologies: { id: string }[];
}

const t = (...ids: string[]) => ids.map((id) => ({ id }));

export const STACK_TEMPLATES: StackTemplate[] = [
  {
    name: "microfrontends",
    title: "Microfrontends",
    description: "React and Vite microfrontends joined at run time with Module Federation 2.",
    kinds: ["mfe-remote", "mfe-shell"],
    technologies: t("typescript", "react", "vite", "module-federation", "css-modules", "vitest", "playwright"),
  },
  {
    name: "mern",
    title: "MERN",
    description: "MongoDB, Express, React and Node.js: one language from the database to the page.",
    kinds: ["spa", "backend", "bff"],
    technologies: t("typescript", "mongodb", "mongoose", "express", "react", "vite", "node", "rest", "vitest"),
  },
  {
    name: "mean",
    title: "MEAN",
    description: "MongoDB, Express, Angular and Node.js.",
    kinds: ["spa", "backend"],
    technologies: t("typescript", "mongodb", "mongoose", "express", "angular", "node", "rest", "jest"),
  },
  {
    name: "mevn",
    title: "MEVN",
    description: "MongoDB, Express, Vue and Node.js.",
    kinds: ["spa", "backend"],
    technologies: t("typescript", "mongodb", "mongoose", "express", "vue", "pinia", "vite", "node", "rest", "vitest"),
  },
  {
    name: "pern",
    title: "PERN",
    description: "PostgreSQL, Express, React and Node.js, with Prisma for the database.",
    kinds: ["spa", "backend", "bff"],
    technologies: t("typescript", "postgres", "prisma", "express", "react", "vite", "node", "rest", "vitest"),
  },
  {
    name: "lamp",
    title: "LAMP",
    description: "Linux, Apache, MySQL and PHP: the classic server-rendered web stack.",
    kinds: ["ssr", "backend"],
    technologies: t("php", "php-fpm", "apache", "mysql", "ssr", "vps"),
  },
  {
    name: "jamstack",
    title: "Jamstack",
    description: "Pages built ahead of time, content from a headless CMS, served from a CDN.",
    kinds: ["ssg", "isr"],
    technologies: t("typescript", "astro", "ssg", "islands", "sanity", "netlify", "edge-caching", "image-optimization"),
  },
  {
    name: "nextjs-trpc-prisma",
    title: "Type-safe Next.js",
    description: "Next.js with tRPC, Prisma and Tailwind: types checked from the database to the page.",
    kinds: ["ssr", "isr"],
    technologies: t("typescript", "react", "nextjs", "trpc", "prisma", "postgres", "tailwind", "authjs", "zod", "ssr", "vercel"),
  },
  {
    name: "tanstack-start",
    title: "TanStack Start",
    description: "React with TanStack Start, Router and Query on Vite: type-safe routes and data.",
    kinds: ["ssr", "spa"],
    technologies: t("typescript", "react", "tanstack-start", "tanstack-router", "tanstack-query", "vite", "tailwind", "ssr", "vitest"),
  },
  {
    name: "remix",
    title: "Remix",
    description: "React with Remix: web standards, nested routes, loaders and actions on the server.",
    kinds: ["ssr"],
    technologies: t("typescript", "react", "remix", "vite", "prisma", "postgres", "tailwind", "ssr", "vitest"),
  },
  {
    name: "react-spa",
    title: "React single-page app",
    description: "React and Vite with TanStack Query: a fast app served as static files.",
    kinds: ["spa"],
    technologies: t("typescript", "react", "vite", "tanstack-query", "tailwind", "csr", "vitest", "playwright"),
  },
  {
    name: "node-api",
    title: "Node.js API",
    description: "Fastify on Node.js with PostgreSQL, Drizzle and Zod.",
    kinds: ["backend", "bff", "function"],
    technologies: t("typescript", "node", "fastify", "rest", "postgres", "drizzle", "zod", "vitest", "opentelemetry"),
  },
  {
    name: "kotlin-spring",
    title: "Kotlin and Spring Boot",
    description: "Kotlin on the JVM with Spring Boot and PostgreSQL.",
    kinds: ["backend"],
    technologies: t("kotlin", "jvm", "spring-boot", "rest", "postgres", "junit"),
  },
  {
    name: "kafka-events",
    title: "Event-driven with Kafka",
    description: "Node.js services that talk through Kafka topics, each with its own PostgreSQL.",
    kinds: ["worker", "backend"],
    technologies: t("typescript", "node", "kafka", "postgres", "drizzle", "zod", "opentelemetry", "vitest"),
  },
  {
    name: "node-worker",
    title: "Background worker",
    description: "Node.js jobs from a Redis queue with BullMQ.",
    kinds: ["worker"],
    technologies: t("typescript", "node", "bullmq", "redis", "zod", "vitest"),
  },
  {
    name: "expo",
    title: "Expo",
    description: "One React Native app for iPhone and Android, built and updated with Expo.",
    kinds: ["mobile"],
    technologies: t("typescript", "react", "react-native", "expo", "tanstack-query", "jest"),
  },
  {
    name: "react-native",
    title: "React Native",
    description: "One React app for iPhone and Android, native projects kept in your hands.",
    kinds: ["mobile"],
    technologies: t("typescript", "react", "react-native", "tanstack-query", "jest"),
  },
  {
    name: "ios-swiftui",
    title: "iOS with SwiftUI",
    description: "A native iPhone and iPad app in Swift and SwiftUI.",
    kinds: ["mobile"],
    technologies: t("swift", "swiftui"),
  },
  {
    name: "android-compose",
    title: "Android with Jetpack Compose",
    description: "A native Android app in Kotlin and Jetpack Compose.",
    kinds: ["mobile"],
    technologies: t("kotlin", "jetpack-compose", "junit"),
  },
  {
    name: "flutter",
    title: "Flutter",
    description: "One Dart codebase for iPhone and Android.",
    kinds: ["mobile"],
    technologies: t("dart", "flutter"),
  },
];
