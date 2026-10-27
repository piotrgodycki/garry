// Starts the packaged app (electron-builder --dir output) and checks that the
// window shows the dashboard and the built-in server answers. Needs a display:
// in CI it runs under xvfb-run. Usage: node scripts/smoke.mjs <app executable>
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright";

const [exe] = process.argv.slice(2);
if (!exe) throw new Error("usage: node scripts/smoke.mjs <app executable>");
const home = mkdtempSync(join(tmpdir(), "garry-desktop-"));
const app = await electron.launch({ executablePath: exe, args: ["--no-sandbox"], env: { ...process.env, HOME: home, GARRY_HOME: join(home, ".garry") } });
try {
  const win = await app.firstWindow();
  await win.locator(".serverStatus", { hasText: "Server online" }).waitFor({ timeout: 20000 });
  const url = win.url();
  if (!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url)) throw new Error(`unexpected page ${url}`);
  // a fresh app starts empty: the server answers, with no sample features
  const features = await win.evaluate(() => fetch("/api/features").then((r) => r.json()));
  if (!Array.isArray(features.features) || features.features.length) throw new Error(`expected no features, got ${JSON.stringify(features)}`);
  console.log(`ok  the app shows the dashboard at ${url} and its server answers`);
} finally {
  await app.close();
}
