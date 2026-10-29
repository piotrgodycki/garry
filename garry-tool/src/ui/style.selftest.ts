/**
 * The dashboard's look, checked from its CSS: text and every state colour are
 * readable (WCAG AA, 4.5:1) on the surfaces they sit on, in the light and the
 * dark theme, and the old brutalist style (uppercase labels, thick ink
 * borders, hard offset shadows) does not creep back in.
 * Run with: pnpm -C garry-tool test:style (CI runs it too).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../../../garry-ui/app", import.meta.url));
let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};

// the tokens live in the first part of globals.css
const css = readFileSync(join(app, "styles", "theme.css"), "utf8");
const tokens = readFileSync(join(app, "tokens.css"), "utf8");
/** the custom properties of the first block that starts with this selector */
const block = (source: string, selector: string) => {
  const at = source.indexOf(selector);
  if (at < 0) throw new Error(`no ${selector} block`);
  const body = source.slice(source.indexOf("{", at) + 1, source.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
};
const light = { ...block(tokens, ":root"), ...block(css, ":root {\n  color-scheme: light") };
const dark = { ...light, ...block(css, ':root[data-theme="dark"]') };

const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

for (const [theme, t] of [["light", light], ["dark", dark]] as const) {
  const value = (name: string) => {
    const v = t[name];
    if (!v || !v.startsWith("#")) throw new Error(`${theme}: ${name} is ${v}`);
    return v;
  };
  for (const surface of ["--bg", "--surface", "--surface-2", "--surface-3"]) {
    for (const ink of ["--color-text-default", "--color-text-muted", "--state-work", "--state-wait", "--state-done", "--state-fail", "--state-plan"]) {
      // muted text and the states are not set on the darkest control fill
      if (surface === "--surface-3" && ink !== "--color-text-default") continue;
      const c = contrast(value(ink), value(surface));
      expect(`${theme}: ${ink} on ${surface} reads (${c.toFixed(2)}:1)`, c >= 4.5);
    }
  }
}

// the iPhone app's palette (garry-mobile/lib/theme.ts) reads the same way
const theme = readFileSync(fileURLToPath(new URL("../../../garry-mobile/lib/theme.ts", import.meta.url)), "utf8");
const palette = (name: string) => {
  const at = theme.indexOf(`const ${name}`);
  const body = theme.slice(theme.indexOf("{", at) + 1, theme.indexOf("};", at));
  return Object.fromEntries([...body.matchAll(/(\w+):\s*"(#[0-9a-f]{6})"/gi)].map((m) => [m[1], m[2]]));
};
for (const name of ["light", "dark"]) {
  const t = palette(name);
  for (const surface of ["bg", "surface", "surface2"])
    for (const ink of ["text", "muted", "work", "wait", "done", "fail", "plan"]) {
      if (!t[ink] || !t[surface]) throw new Error(`the phone's ${name} palette has no ${ink} or ${surface}`);
      const c = contrast(t[ink], t[surface]);
      expect(`phone ${name}: ${ink} on ${surface} reads (${c.toFixed(2)}:1)`, c >= 4.5);
    }
  const c = contrast(t.onPrimary, t.primary);
  expect(`phone ${name}: the primary button's words read (${c.toFixed(2)}:1)`, c >= 4.5);
}
expect("the phone has no old signal red", !/#ff2200|#ff3a1a/i.test(theme));

// the brutalist style stays gone
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".css") ? [p] : [];
  });
const banned: [RegExp, string][] = [
  [/text-transform:\s*uppercase/, "uppercase labels"],
  [/\b2px solid var\(--border-strong\)/, "thick ink borders"],
  [/box-shadow:\s*-?\d+px -?\d+px 0 /, "hard offset shadows"],
  [/#ff2200|#ff3a1a/i, "the old signal red"],
];
for (const f of files(app)) {
  const text = readFileSync(f, "utf8");
  for (const [re, what] of banned) if (re.test(text)) expect(`${relative(app, f)} has no ${what}`, false);
}
expect("no uppercase labels, thick ink borders, hard offset shadows or the old signal red in the dashboard's CSS", true);

// an effect written as a bare expression returns its value, and React calls that value as the
// cleanup: a promise (newer browsers return one from scrollIntoView) breaks the page. Braces or void only.
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
const bare = sources(app).flatMap((f) =>
  [...readFileSync(f, "utf8").matchAll(/use(?:Layout)?Effect\(\s*\(\)\s*=>(?!\s*(?:\{|void\s))/g)].map((m) => `${f.slice(app.length + 1)} at ${m.index}`),
);
expect("every effect has braces (or void): nothing it returns by accident becomes its cleanup", bare.length === 0, bare.join(", "));

if (failed) {
  console.error(`${failed} style check(s) failed`);
  process.exit(1);
}
console.log("The dashboard's look holds");
