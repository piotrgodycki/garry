import { existsSync, readFileSync } from "node:fs";

export interface ShotViewport {
  name: string;
  width: number;
  height: number;
  /** device scale factor, 1 when omitted */
  scale?: number;
}

export interface ShotRoute {
  name: string;
  path: string;
  /** extra settle time in ms after load, overrides the global wait */
  wait?: number;
  /** content streams while agents run: captured and shown, never diffed */
  live?: boolean;
  /** CSS selectors painted over before capture, for clocks or random data */
  mask?: string[];
}

export interface ShotsConfig {
  routes: ShotRoute[];
  viewports: ShotViewport[];
  themes: ("light" | "dark")[];
  /** default settle time in ms after load */
  wait: number;
  /** localStorage key the app reads its theme from, so a theme can be forced */
  themeStorageKey?: string;
}

const SAFE_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Loads and checks garry.screenshots.json. Names become file names, so they are kept to a safe charset. */
export function loadShotsConfig(file: string): ShotsConfig {
  if (!existsSync(file)) throw new Error(`screenshot config not found: ${file}`);
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<ShotsConfig>;
  const routes = raw.routes ?? [];
  const viewports = raw.viewports ?? [{ name: "desktop", width: 1440, height: 900 }];
  const themes = raw.themes ?? ["light"];
  if (routes.length === 0) throw new Error(`${file}: "routes" is empty`);
  for (const r of routes) {
    if (!SAFE_NAME.test(r.name)) throw new Error(`${file}: route name "${r.name}" must match ${SAFE_NAME}`);
    if (!r.path.startsWith("/")) throw new Error(`${file}: route "${r.name}" path must start with /`);
  }
  for (const v of viewports) {
    if (!SAFE_NAME.test(v.name)) throw new Error(`${file}: viewport name "${v.name}" must match ${SAFE_NAME}`);
  }
  for (const t of themes) {
    if (t !== "light" && t !== "dark") throw new Error(`${file}: theme "${t}" must be light or dark`);
  }
  return { routes, viewports, themes, wait: raw.wait ?? 800, themeStorageKey: raw.themeStorageKey };
}

/** File name of one shot: route, viewport and theme. */
export function shotName(route: string, viewport: string, theme: string): string {
  return `${route}--${viewport}--${theme}`;
}
