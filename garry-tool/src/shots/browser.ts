import type { Browser } from "playwright";
import type * as Playwright from "playwright";

/**
 * Launches headless Chromium through Playwright. GARRY_CHROMIUM_PATH points at
 * a preinstalled browser; otherwise Playwright uses its own download
 * (run "pnpm -C garry-tool exec playwright install chromium" once).
 */
export async function launchChromium(): Promise<Browser> {
  let pw: typeof Playwright;
  try {
    pw = await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run pnpm install, then pnpm -C garry-tool exec playwright install chromium.");
  }
  const executablePath = process.env.GARRY_CHROMIUM_PATH?.trim() || undefined;
  return pw.chromium.launch({ headless: true, executablePath });
}
