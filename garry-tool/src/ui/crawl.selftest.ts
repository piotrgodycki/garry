/**
 * Regression test for Garry crawling at the foot of the dashboard, in a real
 * browser: he moves forward every frame by small steps (no jumps), the page
 * keeps its frame rate, he stops when the pointer is at his head, he does not
 * move off screen nor with reduced motion (but is still drawn), and the soil
 * follows the theme. Positions are read from the canvas pixels: the worm is
 * the only pink on it. Needs the built dashboard and Chromium, like
 * test:dropdown. Run with: pnpm -C garry-tool test:crawl (CI runs it too).
 */
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { Page } from "playwright";

const home = mkdtempSync(join(tmpdir(), "garry-crawl-"));
process.env.GARRY_HOME = join(home, ".garry");
const ui = fileURLToPath(new URL("../../../garry-ui/dist", import.meta.url));
if (!existsSync(join(ui, "index.html"))) {
  console.error(`the dashboard is not built (${ui}); run pnpm -C garry-ui build first`);
  process.exit(1);
}

const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");
const { launchChromium } = await import("../shots/browser.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};

const server = createGarryServer({ registry: join(home, "registry"), skills: join(home, "none"), routing: join(home, "none.json"), ui }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

/** In the page: the worm's head and tail (the rightmost and leftmost pink pixels), in CSS pixels, or null. */
const SCAN = `(() => {
  const c = document.querySelector("canvas[data-garry-crawl]");
  const g = c.getContext("2d");
  const k = c.width / c.getBoundingClientRect().width;
  const top = Math.round(38 * k), h = Math.round(26 * k);
  const d = g.getImageData(0, top, c.width, h).data;
  let min = Infinity, max = -Infinity, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a > 200 && r > 190 && r - gg > 45 && gg > 70 && b > 40 && b < 175) {
      const x = (i / 4) % c.width;
      if (x < min) min = x;
      if (x > max) max = x;
      n++;
    }
  }
  return n < 30 ? null : { head: max / k, tail: min / k, pixels: n };
})()`;
const at = (page: Page) => page.evaluate(SCAN) as Promise<{ head: number; tail: number; pixels: number } | null>;

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/`);
  const canvas = page.locator("canvas[data-garry-crawl]");
  await canvas.waitFor();
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const box = (await canvas.boundingBox())!;
  const main = (await page.locator(".content").boundingBox())!;
  expect("the soil runs along the foot of the dashboard, edge to edge", Math.abs(box.width - main.width) < 2 && box.height === 92, `${box.width} of ${main.width}, ${box.height} high`);
  const first = await at(page);
  expect("Garry is drawn", first !== null && first.head - first.tail > 120, JSON.stringify(first));

  // every frame for two seconds: small steps forward, never back, the frame rate kept
  const frames = (await page.evaluate(`new Promise((done) => {
    const out = [];
    const t0 = performance.now();
    const tick = () => {
      out.push(${SCAN});
      if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else done(out);
    };
    requestAnimationFrame(tick);
  })`)) as ({ head: number } | null)[];
  const heads = frames.map((f) => f?.head ?? NaN);
  const steps = heads.slice(1).map((h, i) => h - heads[i]).filter((s) => !Number.isNaN(s) && Math.abs(s) < 500);
  expect("the page keeps its frame rate while he crawls", frames.length >= 100, `${frames.length} frames in 2 s`);
  expect("he moves forward", heads[heads.length - 1] - heads[0] > 15, `${(heads[heads.length - 1] - heads[0]).toFixed(1)} px in 2 s`);
  expect("frame to frame he never jumps nor slides back", steps.every((s) => s > -1 && s < 4), `steps ${Math.min(...steps).toFixed(2)} to ${Math.max(...steps).toFixed(2)} px`);
  expect("he crawls the way a worm does: surges and rests", Math.max(...steps) > 2 * (steps.reduce((a, b) => a + b, 0) / steps.length), steps.map((s) => s.toFixed(1)).join(" ").slice(0, 120));

  // the pointer at his head: he stops and looks up
  const now = (await at(page))!;
  await page.mouse.move(box.x + now.head, box.y + 48);
  await page.waitForTimeout(900);
  const paused = (await at(page))!;
  await page.waitForTimeout(1000);
  const still = (await at(page))!;
  expect("he stops when the pointer is at his head", Math.abs(still.head - paused.head) < 2, `${(still.head - paused.head).toFixed(2)} px in 1 s`);
  await page.mouse.move(box.x + 5, box.y - 200);
  await page.waitForTimeout(1500);
  const going = (await at(page))!;
  expect("and crawls on when it leaves", going.head - still.head > 6, `${(going.head - still.head).toFixed(2)} px`);

  // off screen: no work, no movement
  await page.setViewportSize({ width: 1280, height: 300 });
  await page.evaluate("window.scrollTo(0, 0)");
  await page.waitForTimeout(200);
  const hidden = await canvas.evaluate((c) => c.getBoundingClientRect().top > innerHeight);
  const before = (await at(page))!;
  await page.waitForTimeout(1200);
  const after = (await at(page))!;
  expect("off screen he waits", hidden && Math.abs(after.head - before.head) < 1, `hidden ${hidden}, moved ${(after.head - before.head).toFixed(2)} px`);

  // the theme: the soil follows it
  await page.setViewportSize({ width: 1280, height: 640 });
  await canvas.scrollIntoViewIfNeeded();
  const soil = () => canvas.evaluate((c: HTMLCanvasElement) => Array.from(c.getContext("2d")!.getImageData(Math.round(c.width * 0.97), c.height - 6, 1, 1).data).slice(0, 3).join(","));
  const light = await soil();
  await page.evaluate("document.documentElement.dataset.theme = 'dark'");
  await page.waitForTimeout(300);
  const dark = await soil();
  expect("the soil follows the theme", light !== dark && Number(dark.split(",")[0]) < 80, `${light} then ${dark}`);
  expect("no errors in the page", errors.length === 0, errors.join("; "));
  await page.close();

  // a short page: the soil still sits at the foot of the window
  const tall = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
  await tall.goto(`${base}/`);
  await tall.locator("canvas[data-garry-crawl]").waitFor();
  await tall.waitForTimeout(300);
  const foot = (await tall.locator("canvas[data-garry-crawl]").boundingBox())!;
  // the foot of the window, less the room kept for Garry's field floating there
  const room = await tall.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".content")!).paddingBottom) || 0);
  const bottom = 1600 - room;
  expect("on a short page the soil sits at the foot of the window", Math.abs(foot.y + foot.height - bottom) <= 2, `ends at ${foot.y + foot.height}, the foot is at ${bottom}`);
  await tall.close();

  // reduced motion: drawn, still
  const calm = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  await calm.goto(`${base}/`);
  await calm.locator("canvas[data-garry-crawl]").scrollIntoViewIfNeeded();
  await calm.waitForTimeout(500);
  const a = await at(calm);
  await calm.waitForTimeout(1200);
  const b = await at(calm);
  expect("with reduced motion he is drawn and stays still", a !== null && b !== null && Math.abs(a.head - b.head) < 0.5, `${JSON.stringify(a)} ${JSON.stringify(b)}`);
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.error(`${failed} crawl check(s) failed`);
  process.exit(1);
}
console.log("Garry crawls as expected");
process.exit(0);
