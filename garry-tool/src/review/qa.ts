/**
 * Does this change need a person to try it before it ships? Reads a diff (the
 * changed paths and their added lines) and names the areas a human should check,
 * each with what to do: screens that look different, controls that behave
 * differently, settings that change how things run, sign in and pairing flows,
 * the native apps. Pure tests, docs and CI plumbing need nobody.
 *
 * Used by garry qa (the PR label and checklist in CI) and by Garry when it opens
 * a pull request for a thread.
 */

export interface ChangedFile {
  path: string;
  /** the lines this change adds (without the leading +); empty for a deletion */
  added?: string[];
}

export interface QaArea {
  id: string;
  label: string;
  /** the files that brought this area in (a few, for the reviewer) */
  files: string[];
  checks: string[];
}

export interface QaAssessment {
  needed: boolean;
  areas: QaArea[];
}

interface Rule {
  id: string;
  label: string;
  match: (f: ChangedFile) => boolean;
  checks: string[];
}

const ext = (p: string) => p.slice(p.lastIndexOf(".") + 1).toLowerCase();
const base = (p: string) => p.slice(p.lastIndexOf("/") + 1).toLowerCase();
const any = (f: ChangedFile, re: RegExp) => (f.added ?? []).some((l) => re.test(l));

const TEST = /(^|\/)(__tests__|tests?|e2e|testdata|fixtures)\/|\.(test|spec|selftest)\.[a-z]+$|\.snap$/i;
const DOCS = /\.(md|mdx|txt|rst)$/i;
const UI_EXT = new Set(["tsx", "jsx", "vue", "svelte", "astro", "html", "css", "scss", "sass", "less"]);
const STYLE_EXT = new Set(["css", "scss", "sass", "less"]);

const RULES: Rule[] = [
  {
    id: "ui",
    label: "Looks different",
    match: (f) => UI_EXT.has(ext(f.path)) && (STYLE_EXT.has(ext(f.path)) || ext(f.path) === "html" || any(f, /<[A-Za-z][\w.]*[\s/>]|className=|style=\{/)),
    checks: [
      "Open every screen this touches, in light and dark mode",
      "Check a phone width and a wide desktop window",
      "Check empty, loading and error states, and long text",
    ],
  },
  {
    id: "interaction",
    label: "Behaves differently",
    match: (f) => !TEST.test(f.path) && any(f, /\bon(Click|Press|Submit|Change|KeyDown|KeyUp|Blur|Focus|Drag\w*|Pointer\w*)\b|addEventListener\(|useState\(|useReducer\(|<(button|input|select|textarea|form)\b|window\.confirm\(|navigate\(|router\.(push|replace)\(/),
    checks: [
      "Click through every changed control and the path around it",
      "Use the keyboard only: Tab order, Enter, Escape, focus after actions",
      "Repeat it quickly, cancel half way, go back: nothing should end up stuck or doubled",
    ],
  },
  {
    id: "settings",
    label: "Settings and configuration",
    match: (f) =>
      /(^|\/)(\.env\.example|app\.json|eas\.json|electron-builder\.\w+)$/i.test(f.path) ||
      /(^|\/)(settings|config|preferences)[\w.-]*\.(ts|tsx|js|json|ya?ml)$/i.test(base(f.path)) ||
      /(^|\/)garry\.routing\.json$/.test(f.path) ||
      any(f, /process\.env\.[A-Z_]+|import\.meta\.env\.[A-Z_]+/),
    checks: [
      "Start from a fresh setup (new .env.local, no saved settings) and from an existing one",
      "Try each new or changed setting both ways and check what it changes",
      "Check that the defaults are sensible and documented",
    ],
  },
  {
    id: "security",
    label: "Sign in, pairing and permissions",
    match: (f) => /(auth|pairing|pair|token|session|biometric|touchid|faceid|permission|devices?)[\w.-]*\.(ts|tsx|js)$/i.test(base(f.path)) || any(f, /authenticateAsync|promptTouchID|requireAuthentication|Authorization|Set-Cookie|access_token/),
    checks: [
      "Pair a new device, revoke it, and check it is locked out",
      "Lock and unlock (Face ID, Touch ID, passcode fallback, cancel)",
      "Try the action from a device or origin that should be refused",
    ],
  },
  {
    id: "mobile",
    label: "iPhone app",
    match: (f) => /(^|\/)garry-mobile\//.test(f.path) && !TEST.test(f.path) && !DOCS.test(f.path),
    checks: ["Run it on an iPhone (a development build, not only Expo Go): the changed screens, rotation, background and back"],
  },
  {
    id: "desktop",
    label: "Mac app",
    match: (f) => /(^|\/)garry-desktop\/src\//.test(f.path),
    checks: ["Run the packaged Mac app: menus, the window, sleep and wake, quitting and reopening"],
  },
  {
    id: "data",
    label: "Saved data and formats",
    match: (f) => /(schema|migration|migrations|store|registryIO)[\w.-]*\.(ts|js|sql)$/i.test(base(f.path)) || /(^|\/)migrations?\//.test(f.path),
    checks: ["Open data saved by the previous version (registry, threads, settings) and check nothing is lost or misread"],
  },
];

/** Whether a file can matter to a person at all: tests, docs and CI plumbing do not. */
const relevant = (f: ChangedFile) => !TEST.test(f.path) && !DOCS.test(f.path) && !/^\.github\//.test(f.path) && !/(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(f.path);

export function assessQa(files: ChangedFile[]): QaAssessment {
  const areas: QaArea[] = [];
  for (const rule of RULES) {
    const hits = files.filter((f) => relevant(f) && rule.match(f)).map((f) => f.path);
    if (hits.length) areas.push({ id: rule.id, label: rule.label, files: hits.slice(0, 6), checks: rule.checks });
  }
  return { needed: areas.length > 0, areas };
}

/** Splits a unified diff into changed files with their added lines. */
export function parseDiff(patch: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  let cur: ChangedFile | null = null;
  for (const line of patch.split("\n")) {
    const head = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (head) {
      cur = { path: head[2], added: [] };
      files.push(cur);
    } else if (cur && line.startsWith("+") && !line.startsWith("+++")) cur.added!.push(line.slice(1));
  }
  return files;
}

export const QA_LABEL = "needs human QA";
export const QA_MARKER = "<!-- garry:qa -->";

/** The pull request comment: a badge, then what to check, area by area. */
export function qaMarkdown(a: QaAssessment): string {
  if (!a.needed) {
    return `${QA_MARKER}\n![QA](https://img.shields.io/badge/QA-automated%20checks%20only-2ea44f)\n\nNothing here needs a person to try it: the change is covered by tests and review.`;
  }
  const parts = [
    `${QA_MARKER}\n![QA](https://img.shields.io/badge/QA-needs%20a%20human-orange)\n`,
    `**Before merging, someone should try this.** Garry found ${a.areas.length === 1 ? "one area" : `${a.areas.length} areas`} a test cannot judge:`,
  ];
  for (const area of a.areas) {
    parts.push(`\n### ${area.label}\n${area.checks.map((c) => `- [ ] ${c}`).join("\n")}\n\n<sub>${area.files.map((f) => `\`${f}\``).join(", ")}</sub>`);
  }
  return parts.join("\n");
}
