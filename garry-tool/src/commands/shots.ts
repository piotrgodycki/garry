import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { loadShotsConfig } from "../shots/config.js";
import { capture } from "../shots/capture.js";
import { compare, type Report } from "../shots/compare.js";
import { renderComment, SHOTS_MARKER } from "../shots/comment.js";
import { GitHub, parseSlug } from "../github/client.js";
import { githubToken } from "../github/env.js";

const HELP = `garry shots <capture|compare|comment> [options]

Screenshots for code review. A pull request in review gets one comment with
before and after screenshots of every view that changed.

  capture  --url <app url> --out <dir> [--config garry.screenshots.json]
           open every route in headless Chromium and save full page PNGs
  compare  --base <dir> --head <dir> --out <dir> [--base-label <s>] [--head-label <s>]
           diff two captures pixel by pixel, write report.json and diff images
  comment  --report <report.json> --repo <owner/name> --pr <n> --images-url <template>
           [--run-url <url>] [--dry-run]
           create or update the pull request comment. The template turns a report
           path into an image url, for example
           https://github.com/o/r/blob/garry-screenshots/pr-7/abc1234/{path}?raw=true

Token: GITHUB_TOKEN (in CI) or GARRY_GITHUB_TOKEN. Browser: Playwright's
Chromium, or GARRY_CHROMIUM_PATH for a preinstalled one.
`;

function flags(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = true;
  }
  return out;
}

function need(f: Record<string, string | true>, key: string): string {
  const v = f[key];
  if (typeof v !== "string" || !v) throw new Error(`garry shots: --${key} is required. Run garry shots --help.`);
  return v;
}

export async function runShots(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  const f = flags(rest);
  if (!sub || sub === "--help" || sub === "-h" || f.help) {
    console.log(HELP);
    return;
  }

  if (sub === "capture") {
    const cfg = loadShotsConfig(typeof f.config === "string" ? f.config : "garry.screenshots.json");
    const out = need(f, "out");
    const url = need(f, "url");
    console.log(pc.bold(`Capturing ${cfg.routes.length} routes x ${cfg.viewports.length} viewports x ${cfg.themes.length} themes from ${url}`));
    const entries = await capture(cfg, url, out);
    const failed = entries.filter((e) => e.error).length;
    console.log(`${entries.length - failed} captured, ${failed} failed, saved to ${out}`);
    // every page failing means the app never came up: fail the step loudly
    if (failed === entries.length) process.exitCode = 1;
    return;
  }

  if (sub === "compare") {
    const out = need(f, "out");
    const report = await compare(need(f, "base"), need(f, "head"), out, {
      base: typeof f["base-label"] === "string" ? f["base-label"] : "base",
      head: typeof f["head-label"] === "string" ? f["head-label"] : "head",
    });
    const count = (s: string) => report.entries.filter((e) => e.status === s).length;
    console.log(
      `changed ${count("changed")}, new ${count("added")}, removed ${count("removed")}, live ${count("live")}, unchanged ${count("unchanged")}, failed ${count("failed")}`,
    );
    console.log(`report: ${join(out, "report.json")}`);
    return;
  }

  if (sub === "comment") {
    const report = JSON.parse(readFileSync(need(f, "report"), "utf8")) as Report;
    const template = need(f, "images-url");
    if (!template.includes("{path}")) throw new Error("garry shots: --images-url must contain {path}");
    const body = renderComment(report, (rel) => template.replace("{path}", rel), {
      runUrl: typeof f["run-url"] === "string" ? f["run-url"] : undefined,
    });
    if (f["dry-run"]) {
      const file = need(f, "report").replace(/report\.json$/, "comment.md");
      writeFileSync(file, body);
      console.log(`dry run: comment written to ${file}`);
      return;
    }
    const slug = parseSlug(need(f, "repo"));
    const pr = Number(need(f, "pr"));
    if (!slug || !Number.isInteger(pr) || pr <= 0) throw new Error("garry shots: --repo must be owner/name and --pr a number");
    const token = process.env.GITHUB_TOKEN?.trim() || githubToken();
    if (!token) throw new Error("garry shots: set GITHUB_TOKEN or GARRY_GITHUB_TOKEN to post the comment");
    const res = await new GitHub(token).upsertComment(slug.owner, slug.name, pr, SHOTS_MARKER, body);
    console.log(`${res.created ? "posted" : "updated"} ${res.url}`);
    return;
  }

  console.error(`Unknown shots command: ${sub}`);
  process.exitCode = 1;
}
