import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChromium } from "./browser.js";
import { shotName, type ShotsConfig } from "./config.js";

export interface ShotEntry {
  name: string;
  route: string;
  path: string;
  viewport: string;
  theme: string;
  live: boolean;
  file: string;
  error?: string;
}

/**
 * Captures every route in every viewport and theme. Motion is frozen (reduced
 * motion plus Playwright's animation freeze) so two runs of the same code give
 * the same pixels. A page that fails to load is recorded, not fatal.
 */
export async function capture(cfg: ShotsConfig, baseUrl: string, outDir: string, log = console.log): Promise<ShotEntry[]> {
  mkdirSync(outDir, { recursive: true });
  const browser = await launchChromium();
  const entries: ShotEntry[] = [];
  try {
    for (const vp of cfg.viewports) {
      for (const theme of cfg.themes) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.scale ?? 1,
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        if (cfg.themeStorageKey) {
          await ctx.addInitScript(
            ([key, value]) => {
              try {
                localStorage.setItem(key, value);
              } catch {
                // storage blocked: the color scheme emulation still applies
              }
            },
            [cfg.themeStorageKey, theme] as const,
          );
        }
        const page = await ctx.newPage();
        for (const route of cfg.routes) {
          const name = shotName(route.name, vp.name, theme);
          const file = `${name}.png`;
          const entry: ShotEntry = { name, route: route.name, path: route.path, viewport: vp.name, theme, live: Boolean(route.live), file };
          try {
            await page.goto(new URL(route.path, baseUrl).toString(), { waitUntil: "load", timeout: 30000 });
            // hide the Next.js dev overlay so dev and production captures compare cleanly
            await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
            await page.evaluate(() => document.fonts.ready.then(() => undefined));
            await page.waitForTimeout(route.wait ?? cfg.wait);
            await page.screenshot({
              path: join(outDir, file),
              fullPage: true,
              animations: "disabled",
              caret: "hide",
              mask: (route.mask ?? []).map((m) => page.locator(m)),
            });
            log(`  captured ${name}`);
          } catch (e) {
            entry.error = (e as Error).message.split("\n")[0];
            log(`  failed ${name}: ${entry.error}`);
          }
          entries.push(entry);
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify({ baseUrl, entries }, null, 2));
  return entries;
}
