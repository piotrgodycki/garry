/**
 * Every technology in Garry's catalog has a mark in the dashboard (a logo, or a
 * monogram where the brand's own cannot be used), so a technology added to the
 * catalog without one is caught here rather than shown as two bare letters.
 * The same for every block of the architecture board.
 * Run with: pnpm -C garry-tool test:marks (CI runs it too).
 */
import { CATALOG } from "../registry/schema/stacks.js";
import { COMPONENTS } from "../registry/schema/architecture.js";
// the dashboard's file, loaded at run time (it is checked by the dashboard's own typecheck)
const marks = "../../../garry-ui/app/TechIcon.tsx";
const { hasTechMark } = (await import(marks)) as { hasTechMark: (id: string) => boolean };

const missing = CATALOG.filter((t) => !hasTechMark(t.id)).map((t) => t.id);
if (missing.length) {
  console.error(`FAIL these technologies have no mark in garry-ui/app/TechIcon.tsx: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`ok   all ${CATALOG.length} technologies in the catalog have a mark`);

const logos = "../../../garry-ui/app/architecture/logos.ts";
const { logoOf } = (await import(logos)) as { logoOf: (id: string) => unknown };
// a browser and a phone app of any make are no brand: they are drawn with the glyph of their kind
const GENERIC = new Set(["browser", "mobile-app"]);
const bare = COMPONENTS.filter((c) => !GENERIC.has(c.id) && !logoOf(c.id)).map((c) => c.id);
if (bare.length) {
  console.error(`FAIL these architecture blocks have no mark in garry-ui/app/architecture/logos.ts: ${bare.join(", ")}`);
  process.exit(1);
}
console.log(`ok   all ${COMPONENTS.length - GENERIC.size} branded architecture blocks have a mark`);
