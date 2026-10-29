#!/usr/bin/env node
/**
 * Garry's brand files, drawn from one source: the worm's geometry in
 * garry-ui/app/GarryMark.tsx. Writes the mark, the logo (light and dark), the
 * favicon, and the app icons for the Mac app and the iPhone app.
 *
 *   node garry-tool/scripts/brand.mjs           write them all
 *   node garry-tool/scripts/brand.mjs --check   fail if a committed SVG differs (CI)
 *
 * The PNG icons are rendered with Chromium (Playwright, GARRY_CHROMIUM_PATH
 * like the UI tests); --check compares the SVGs only, which the PNGs are
 * drawn from.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(join(root, "garry-ui/app/GarryMark.tsx"), "utf8");
const geometry = (name) => {
  const m = new RegExp(`const ${name} = "([^"]+)"`).exec(source);
  if (!m) throw new Error(`GarryMark.tsx has no ${name}`);
  return m[1];
};
const MAIN = geometry("MAIN");
const TAIL = geometry("TAIL");
const CENTER = geometry("CENTER");
const CLITELLUM = geometry("CLITELLUM");

// the worm's colours: the same as the dashboard's --garry-* tokens
export const COLORS = { worm: "#ee9b86", ring: "#c47562", clay: "#d9573a" };
const INK = { light: { name: "#17181b", tag: "#757b86" }, dark: { name: "#ecedef", tag: "#9aa0aa" } };
const FONT = "'IBM Plex Sans', Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** The worm on a 100 x 100 grid: body, segment rings, and the clitellum band. */
const worm = (id) =>
  [
    `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">`,
    `<path d="${MAIN}" fill="none" stroke="#fff" stroke-width="15.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${TAIL}" fill="#fff"/></mask></defs>`,
    `<path d="${MAIN}" fill="none" stroke="${COLORS.worm}" stroke-width="15.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${TAIL}" fill="${COLORS.worm}"/>`,
    `<g mask="url(#${id})">`,
    `<path d="${CENTER}" fill="none" stroke="${COLORS.ring}" stroke-width="22" stroke-dasharray="1.1 7.4"/>`,
    `<path d="${CLITELLUM}" fill="none" stroke="${COLORS.clay}" stroke-width="22"/>`,
    `</g>`,
  ].join("\n");

const mark = () => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" role="img" aria-label="Garry">\n${worm("gm")}\n</svg>\n`;

const logo = (theme) => `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="88" viewBox="0 0 300 88" role="img" aria-label="Garry logo">
<g transform="translate(0 0) scale(.88)">
${worm(`gl-${theme}`)}
</g>
<text x="94" y="52" font-family="${FONT}" font-size="46" font-weight="600" letter-spacing="-1.2" fill="${INK[theme].name}">garry</text>
<text x="97" y="76" font-family="${FONT}" font-size="12.5" font-weight="500" fill="${INK[theme].tag}">AI SDLC orchestrator</text>
</svg>
`;

const favicon = () => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g transform="translate(-1 -1) scale(.66)">
${worm("gi")}
</g></svg>
`;

/** App icons: the worm on graphite. The Mac keeps its own margin and squircle; iOS draws the corners itself. */
const appIcon = (kind) => {
  const mac = kind === "mac";
  const plate = mac
    ? `<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)"/><rect x="100.5" y="100.5" width="823" height="823" rx="184.5" fill="none" stroke="#ffffff" stroke-opacity=".08"/>`
    : `<rect width="1024" height="1024" fill="url(#bg)"/>`;
  const size = mac ? 600 : 700;
  const at = (1024 - size) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#24262b"/><stop offset="1" stop-color="#141517"/></linearGradient></defs>
${plate}
<svg x="${at}" y="${at + 8}" width="${size}" height="${size}" viewBox="0 0 100 100">${worm(`ga-${kind}`)}</svg>
</svg>
`;
};

const SVGS = {
  "assets/garry-mark.svg": mark(),
  "assets/garry-logo.svg": logo("light"),
  "assets/garry-logo-dark.svg": logo("dark"),
  "garry-ui/public/garry-mark.svg": mark(),
  "garry-ui/public/garry-logo.svg": logo("light"),
  "garry-ui/public/icon.svg": favicon(),
};
const PNGS = {
  "garry-desktop/build/icon.png": appIcon("mac"),
  "garry-mobile/assets/icon.png": appIcon("ios"),
};

if (process.argv.includes("--check")) {
  const stale = Object.entries(SVGS).filter(([path, svg]) => {
    try {
      return readFileSync(join(root, path), "utf8") !== svg;
    } catch {
      return true;
    }
  });
  if (stale.length) {
    console.error(`These brand files are not drawn from GarryMark.tsx; run node garry-tool/scripts/brand.mjs:\n  ${stale.map(([p]) => p).join("\n  ")}`);
    process.exit(1);
  }
  console.log(`ok   all ${Object.keys(SVGS).length} brand SVGs match the mark in GarryMark.tsx`);
  process.exit(0);
}

for (const [path, svg] of Object.entries(SVGS)) {
  writeFileSync(join(root, path), svg);
  console.log(`wrote ${path}`);
}
const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.GARRY_CHROMIUM_PATH?.trim() || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  for (const [path, svg] of Object.entries(PNGS)) {
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.locator("svg").first().screenshot({ path: join(root, path), omitBackground: true });
    console.log(`wrote ${relative(root, join(root, path))}`);
  }
} finally {
  await browser.close();
}
