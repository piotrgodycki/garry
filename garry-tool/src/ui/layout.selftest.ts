/**
 * Regression test for the dashboard's layout, in a real browser against a real
 * Garry server with a project, agents at work and a feature in flight. Every
 * page, at a wide screen, a laptop, a tablet, a phone and a short window:
 * nothing makes the page scroll sideways, nothing sticks out past the screen
 * unless it sits in something that scrolls, no button or link lies on top of
 * another or under something else, the page uses the whole width, and the
 * sidebar keeps its foot (talk, server, theme) in view. On a tablet and a
 * phone the menu is a drawer that opens, goes to a page and closes again; on a
 * wide screen the voice dock sits beside the page instead of over it.
 * GARRY_LAYOUT_SHOTS=<dir> also saves a screenshot of each page and size;
 * GARRY_LAYOUT_SIZES=phone,laptop checks only those sizes; GARRY_LAYOUT_SCHEME=dark
 * checks in the dark theme.
 * Needs the built dashboard and Chromium, like test:dropdown.
 * Run with: pnpm -C garry-tool test:layout (CI runs it too).
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { Page } from "playwright";

const home = mkdtempSync(join(tmpdir(), "garry-layout-"));
process.env.GARRY_HOME = join(home, ".garry");
process.env.GARRY_CLAUDE_BIN = fileURLToPath(new URL("../threads/testdata/fake-claude.mjs", import.meta.url));
const ui = fileURLToPath(new URL("../../../garry-ui/dist", import.meta.url));
if (!existsSync(join(ui, "index.html"))) {
  console.error(`the dashboard is not built (${ui}); run pnpm -C garry-ui build first`);
  process.exit(1);
}
const shots = process.env.GARRY_LAYOUT_SHOTS?.trim();
if (shots) mkdirSync(shots, { recursive: true });

const { createGarryServer } = await import("../server/server.js");
const { DeviceStore } = await import("../server/auth.js");
const { ThreadManager } = await import("../threads/manager.js");
const { ThreadStore } = await import("../threads/store.js");
const { launchChromium } = await import("../shots/browser.js");

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const until = async (f: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return f();
};

// a project with work in every state, and a registry with services and a feature
const repo = join(home, "shop");
execFileSync("git", ["init", "-q", repo]);
writeFileSync(join(repo, "README.md"), "# shop\n");
execFileSync("git", ["-C", repo, "add", "-A"]);
execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
const threads = new ThreadManager(new ThreadStore(process.env.GARRY_HOME!));
const project = threads.store.addProject(repo);
const ready = threads.create(project.id, "write the release notes for the spring release, every service and every change since March");
await until(() => !threads.isRunning(ready.id));
const asks = threads.create(project.id, "ASK add a buy button");
await until(() => !threads.isRunning(asks.id));
const busy = threads.create(project.id, "BUSY add a checkout page with a quick cart, saved addresses and Apple Pay");
await until(() => threads.store.events(busy.id).some((e) => e.type === "tool"));

const registry = join(home, "registry");
cpSync(fileURLToPath(new URL("../../testdata/registry/frontend", import.meta.url)), registry, { recursive: true });
const skills = fileURLToPath(new URL("../../skills", import.meta.url));
const server = createGarryServer({ registry, skills, routing: join(home, "none.json"), threads, ui }, new DeviceStore(join(home, "devices.json")));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const PAGES: [string, string][] = [
  ["dashboard", "/"],
  ["live", "/live"],
  ["build", "/build"],
  ["pipeline", "/build?view=pipeline&feature=FEAT-123"],
  ["work", `/build/${ready.id}`],
  ["service", "/service/checkout-mfe?feature=FEAT-123"],
  ["pull-requests", "/github"],
  ["services", "/registry"],
  ["architecture", "/architecture"],
  ["stacks", "/stacks"],
  ["files", "/files"],
  ["skills", "/skills"],
  ["routing", "/routing"],
  ["settings", "/settings"],
];
const ALL_SIZES = [
  { name: "wide", width: 1920, height: 1080 },
  { name: "laptop", width: 1280, height: 640 },
  { name: "small-laptop", width: 1024, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
  { name: "small-phone", width: 320, height: 640 },
];
const only = process.env.GARRY_LAYOUT_SIZES?.split(",").map((x) => x.trim());
const SIZES = only ? ALL_SIZES.filter((s) => only.includes(s.name)) : ALL_SIZES;

/** Everything wrong with the layout of the page as it is now, in words. */
const problems = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const name = (el: Element) => {
      const label = el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("placeholder") || el.getAttribute("title") || "";
      return `<${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(" ")[0]}` : ""}> "${label.trim().replace(/\s+/g, " ").slice(0, 40)}"`;
    };
    const shown = (el: Element) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0 && r.width > 1 && r.height > 1;
    };
    /** the boxes of the ancestors that cut off what overflows them */
    const clips = (el: Element) => {
      const boxes: DOMRect[] = [];
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== "visible" || s.overflowY !== "visible") boxes.push(p.getBoundingClientRect());
        if (s.position === "fixed") break;
      }
      return boxes;
    };
    const scrollsSideways = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if ((s.overflowX === "auto" || s.overflowX === "scroll") && p.scrollWidth > p.clientWidth) return true;
      }
      return false;
    };

    // every field says what it is for, also to a screen reader: a label, aria-label or aria-labelledby
    for (const f of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input:not([type=hidden]), textarea, select")) {
      if (f.closest("[inert], [aria-hidden=true]") || f.getClientRects().length === 0) continue;
      const named = (f.labels?.length ?? 0) > 0 || f.getAttribute("aria-label")?.trim() || f.getAttribute("aria-labelledby") || f.getAttribute("title");
      if (!named) out.push(`a field has no name (${f.tagName.toLowerCase()} "${f.getAttribute("placeholder") ?? ""}")`);
    }
    if (document.documentElement.scrollWidth > vw + 1) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth}px wide on a ${vw}px screen)`);

    /** the part of an element that can be seen: its box cut down by every ancestor that clips it */
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect();
      let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      for (const c of clips(el)) box = { left: Math.max(box.left, c.left), top: Math.max(box.top, c.top), right: Math.min(box.right, c.right), bottom: Math.min(box.bottom, c.bottom) };
      return box.right - box.left > 1 && box.bottom - box.top > 1 ? box : null;
    };
    /** a drawer, a dock, a scrim, or a bar pinned to an edge (the top bar, the command line) lies over the page on purpose */
    const layer = (el: Element) => {
      for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
        const pos = getComputedStyle(p).position;
        if (pos === "fixed" || pos === "sticky") return p;
      }
      return null;
    };

    const controls = [...document.querySelectorAll("a[href], button, input, textarea, [role=tab], [role=combobox], [role=switch]")].filter(shown);
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if ((r.right > vw + 1 || r.left < -1) && !scrollsSideways(el)) out.push(`${name(el)} sticks out past the screen (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
    }
    // what is under the middle of each control that can be seen: it, or something inside it
    const visible = controls.map((el) => ({ el, box: seen(el) })).filter((c) => c.box);
    for (const { el, box } of visible) {
      const x = (box!.left + box!.right) / 2;
      const y = (box!.top + box!.bottom) / 2;
      if (x < 0 || y < 0 || x > vw || y > vh) continue;
      const top = document.elementFromPoint(x, y);
      if (!top || top === el || el.contains(top) || top.contains(el)) continue;
      // under an open drawer, dock or scrim: hidden on purpose
      if (layer(top) && layer(top) !== layer(el)) continue;
      out.push(`${name(el)} is covered by ${name(top)}`);
    }
    // controls lying on one another, in the same layer
    for (let i = 0; i < visible.length; i++)
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i]!;
        const b = visible[j]!;
        if (a.el.contains(b.el) || b.el.contains(a.el) || layer(a.el) !== layer(b.el)) continue;
        const w = Math.min(a.box!.right, b.box!.right) - Math.max(a.box!.left, b.box!.left);
        const h = Math.min(a.box!.bottom, b.box!.bottom) - Math.max(a.box!.top, b.box!.top);
        if (w > 2 && h > 2) out.push(`${name(a.el)} lies on ${name(b.el)} (${Math.round(w)}x${Math.round(h)}px)`);
      }
    // headings and labels cut off by their box without an ellipsis to say so
    for (const el of document.querySelectorAll("h1, h2, h3, .eyebrow, .btn, .badge, .chip, th")) {
      if (!shown(el)) continue;
      const s = getComputedStyle(el);
      const he = el as HTMLElement;
      if (s.textOverflow !== "ellipsis" && s.overflowX !== "visible" && he.scrollWidth > he.clientWidth + 1) out.push(`${name(el)} is cut off`);
    }
    // the page fills the room beside the menu
    const main = document.querySelector(".content > *");
    const content = document.querySelector(".content");
    if (main && content && main.getBoundingClientRect().width < content.getBoundingClientRect().width - 1)
      out.push(`the page is ${Math.round(main.getBoundingClientRect().width)}px wide in ${Math.round(content.getBoundingClientRect().width)}px of room`);
    return [...new Set(out)];
  });

const browser = await launchChromium();
// tsx names the functions it compiles with a helper the page does not have
const newPage = async (viewport: { width: number; height: number }) => {
  const page = await browser.newPage({ viewport, colorScheme: process.env.GARRY_LAYOUT_SCHEME === "dark" ? "dark" : "light" });
  await page.addInitScript("globalThis.__name = (f) => f");
  return page;
};
try {
  for (const size of SIZES) {
    const page = await newPage({ width: size.width, height: size.height });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const [label, path] of PAGES) {
      await page.goto(`${base}${path}`);
      await page.locator(".content > *").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      if (shots) await page.screenshot({ path: join(shots, `${label}-${size.name}.png`), fullPage: true });
      const crashed = (await page.getByText("Unexpected Application Error").count()) > 0 || (await page.locator(".content > *").count()) === 0;
      const found = crashed ? [`the page did not render: ${(await page.locator("body").innerText()).slice(0, 160)}`] : await problems(page);
      // Garry's field floats at the foot: scrolled to the bottom, nothing of the page stays under it
      const under = await page.evaluate(() => {
        const bar = document.querySelector(".garryField");
        if (!bar || getComputedStyle(bar).display === "none") return 0;
        window.scrollTo(0, document.documentElement.scrollHeight);
        const top = bar.getBoundingClientRect().top;
        const shown = [...document.querySelectorAll(".content a[href], .content button, .content input, .content textarea")].filter((e) => {
          const r = e.getBoundingClientRect();
          return r.height > 0 && r.width > 0 && getComputedStyle(e).visibility !== "hidden";
        });
        // a control scrolled away inside its own panel (the blocks of the board) is not under the line
        const bottom = (e: Element) => {
          let b = e.getBoundingClientRect().bottom;
          for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
            const o = getComputedStyle(p);
            if (o.overflowY !== "visible" || o.overflowX !== "visible") b = Math.min(b, p.getBoundingClientRect().bottom);
          }
          return b;
        };
        const lowest = Math.max(0, ...shown.map(bottom));
        window.scrollTo(0, 0);
        return lowest - top;
      });
      if (under > 1) found.push(`scrolled to the bottom, the page's last control is ${Math.round(under)}px under Garry's field`);
      expect(`${label} at ${size.name} (${size.width}x${size.height}) lays out cleanly`, found.length === 0, `\n    ${found.join("\n    ")}`);
    }

    const drawer = size.width <= 900;
    if (!drawer) {
      const foot = await page.locator(".railFoot").boundingBox();
      expect(`at ${size.name} the rail's foot (theme, server) is in view`, Boolean(foot && foot.y + foot.height <= size.height), JSON.stringify(foot));
      expect(`at ${size.name} there is no menu button`, (await page.getByRole("button", { name: "open menu" }).count()) === 0 || !(await page.getByRole("button", { name: "open menu" }).isVisible()));
    } else {
      await page.goto(`${base}/`);
      const nav = page.getByRole("navigation", { name: "main" });
      expect(`at ${size.name} the menu starts put away`, !(await nav.getByRole("link", { name: "Stacks" }).isVisible()));
      await page.getByRole("button", { name: "open menu" }).click();
      await nav.getByRole("link", { name: "Stacks" }).waitFor({ state: "visible", timeout: 3000 }).catch(() => undefined);
      expect(`at ${size.name} the menu button opens every page`, await nav.getByRole("link", { name: "Stacks" }).isVisible());
      const groups = await nav.locator(".navLabel").allInnerTexts();
      await page.waitForTimeout(400);
      expect(`at ${size.name} the drawer shows the menu's groups`, groups.map((g) => g.toLowerCase()).join(",") === "work,project,garry", groups.join(","));
      const open = await problems(page);
      expect(`at ${size.name} the open drawer lays out cleanly`, open.length === 0, `\n    ${open.join("\n    ")}`);
      await nav.getByRole("link", { name: "Stacks" }).click();
      await page.waitForURL("**/stacks");
      await page.waitForTimeout(400);
      expect(`at ${size.name} picking a page goes there and puts the menu away`, page.url().endsWith("/stacks") && !(await nav.getByRole("link", { name: "Stacks" }).isVisible()));
      await page.getByRole("button", { name: "open menu" }).click();
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      expect(`at ${size.name} Escape puts the menu away`, !(await nav.getByRole("link", { name: "Stacks" }).isVisible()));
    }
    expect(`no errors in the pages at ${size.name}`, errors.length === 0, errors.join("; "));
    await page.close();
  }

  // what you told Garry, showing above the field, lies over the page cleanly
  for (const text of ["BUSY tidy the cart", "then rename the buttons"]) await fetch(`${base}/api/garry/queue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  for (const size of [ALL_SIZES[0], ALL_SIZES[ALL_SIZES.length - 1]]) {
    const page = await newPage({ width: size.width, height: size.height });
    await page.goto(`${base}/`);
    await page.getByRole("button", { name: "show what you told Garry" }).click({ timeout: 8000 }).catch(() => undefined);
    await page.getByRole("list", { name: "what you told Garry" }).getByText("then rename the buttons").waitFor({ timeout: 8000 }).catch(() => undefined);
    const shown = (await page.getByRole("list", { name: "what you told Garry" }).count()) === 1;
    const found = await problems(page);
    expect(`at ${size.name} Garry's line of messages shows and the page lays out cleanly`, shown && found.length === 0, `\n    ${found.join("\n    ")}`);
    await page.close();
  }
} finally {
  await browser.close();
  for (const t of threads.store.threads()) threads.stop(t.id);
  server.close();
}

if (failed) {
  console.error(`${failed} layout check(s) failed`);
  process.exit(1);
}
console.log("Every page lays out cleanly");
process.exit(0);
