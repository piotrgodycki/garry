/**
 * Every technology in Garry's catalog has a mark in the dashboard (a logo, or a
 * monogram where the brand's own cannot be used), so a technology added to the
 * catalog without one is caught here rather than shown as two bare letters.
 * Run with: pnpm -C garry-tool test:marks (CI runs it too).
 */
import { CATALOG } from "../registry/schema/stacks.js";
// the dashboard's file, loaded at run time (it is checked by the dashboard's own typecheck)
const marks = "../../../garry-ui/app/TechIcon.tsx";
const { hasTechMark } = (await import(marks)) as { hasTechMark: (id: string) => boolean };

const missing = CATALOG.filter((t) => !hasTechMark(t.id)).map((t) => t.id);
if (missing.length) {
  console.error(`FAIL these technologies have no mark in garry-ui/app/TechIcon.tsx: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`ok   all ${CATALOG.length} technologies in the catalog have a mark`);
