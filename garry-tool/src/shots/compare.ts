import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChromium } from "./browser.js";
import type { ShotEntry } from "./capture.js";

export type ShotStatus = "changed" | "unchanged" | "added" | "removed" | "live" | "failed";

export interface ReportEntry {
  name: string;
  route: string;
  path: string;
  viewport: string;
  theme: string;
  status: ShotStatus;
  /** share of pixels that differ, 0..1, for changed views */
  ratio?: number;
  /** paths relative to the report directory */
  base?: string;
  head?: string;
  diff?: string;
}

export interface Report {
  baseLabel: string;
  headLabel: string;
  entries: ReportEntry[];
}

// A pixel counts as different when its summed RGB delta passes this, which
// ignores antialiasing noise. A view counts as changed past MIN_RATIO.
const PIXEL_DELTA = 48;
const MIN_RATIO = 0.0005;

function readManifest(dir: string): ShotEntry[] {
  const file = join(dir, "manifest.json");
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, "utf8")) as { entries: ShotEntry[] }).entries;
}

/**
 * Compares a base and a head capture view by view and writes a self contained
 * report directory: base/, head/, diff/ and report.json. Missing base (a new
 * page, or a base that failed to build) is reported as added, not as an error.
 */
export async function compare(baseDir: string, headDir: string, outDir: string, labels: { base: string; head: string }): Promise<Report> {
  for (const sub of ["base", "head", "diff"]) mkdirSync(join(outDir, sub), { recursive: true });
  const base = new Map(readManifest(baseDir).filter((e) => !e.error).map((e) => [e.name, e]));
  const head = readManifest(headDir);
  const entries: ReportEntry[] = [];
  const browser = await launchChromium();
  const page = await browser.newPage();
  try {
    for (const h of head) {
      const entry: ReportEntry = { name: h.name, route: h.route, path: h.path, viewport: h.viewport, theme: h.theme, status: "unchanged" };
      if (h.error) {
        entries.push({ ...entry, status: "failed" });
        continue;
      }
      copyFileSync(join(headDir, h.file), join(outDir, "head", h.file));
      entry.head = `head/${h.file}`;
      const b = base.get(h.name);
      if (b) {
        copyFileSync(join(baseDir, b.file), join(outDir, "base", b.file));
        entry.base = `base/${b.file}`;
      }
      if (h.live) entry.status = "live";
      else if (!b) entry.status = "added";
      else {
        const res = await diffImages(page, join(baseDir, b.file), join(headDir, h.file));
        entry.ratio = res.ratio;
        if (res.ratio > MIN_RATIO) {
          entry.status = "changed";
          writeFileSync(join(outDir, "diff", h.file), Buffer.from(res.png, "base64"));
          entry.diff = `diff/${h.file}`;
        }
      }
      entries.push(entry);
    }
    const headNames = new Set(head.map((h) => h.name));
    for (const b of base.values()) {
      if (headNames.has(b.name)) continue;
      copyFileSync(join(baseDir, b.file), join(outDir, "base", b.file));
      entries.push({ name: b.name, route: b.route, path: b.path, viewport: b.viewport, theme: b.theme, status: "removed", base: `base/${b.file}` });
    }
  } finally {
    await browser.close();
  }
  const report: Report = { baseLabel: labels.base, headLabel: labels.head, entries };
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  return report;
}

// Runs inside Chromium. Kept as plain source text: a bundled function would carry
// helpers (esbuild's __name) that do not exist in the page.
const DIFF_SCRIPT = `async ({ srcA, srcB, delta }) => {
  const load = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("cannot decode screenshot"));
    img.src = src;
  });
  const [ia, ib] = await Promise.all([load(srcA), load(srcB)]);
  const w = Math.max(ia.width, ib.width);
  const h = Math.max(ia.height, ib.height);
  const read = (img) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, w, h).data;
  };
  const da = read(ia);
  const db = read(ib);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  const img = octx.createImageData(w, h);
  let changed = 0;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) + Math.abs(da[i + 3] - db[i + 3]);
    if (d > delta) {
      changed++;
      img.data[i] = 255; img.data[i + 1] = 34; img.data[i + 2] = 0; img.data[i + 3] = 255;
    } else {
      // the new version, faded, so the red marks read in context
      const v = 255 - (255 - (db[i] + db[i + 1] + db[i + 2]) / 3) * 0.25;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return { ratio: changed / (w * h), png: out.toDataURL("image/png").split(",")[1] };
}`;

/** Diffs two PNGs on a canvas inside Chromium. Returns the changed share and a diff image. */
async function diffImages(page: import("playwright").Page, a: string, b: string): Promise<{ ratio: number; png: string }> {
  const toUrl = (f: string) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
  const args = JSON.stringify({ srcA: toUrl(a), srcB: toUrl(b), delta: PIXEL_DELTA });
  return page.evaluate(`(${DIFF_SCRIPT})(${args})`) as Promise<{ ratio: number; png: string }>;
}
