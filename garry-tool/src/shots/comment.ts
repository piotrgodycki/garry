import type { Report, ReportEntry } from "./compare.js";

/** Hidden marker that identifies Garry's screenshot comment, so it is updated instead of duplicated. */
export const SHOTS_MARKER = "<!-- garry:pr-screenshots -->";

const pct = (r?: number) => (r === undefined ? "" : r < 0.001 ? "<0.1%" : `${(r * 100).toFixed(1)}%`);
const label = (e: ReportEntry) => `${e.route} · ${e.viewport} · ${e.theme}`;

/**
 * Renders the pull request comment. Changed views come first with before, after
 * and a diff; new and live views show the current state; unchanged views are
 * only listed, so a reviewer sees what moved without scrolling through noise.
 */
export function renderComment(report: Report, imageUrl: (rel: string) => string, opts: { runUrl?: string; maxImages?: number } = {}): string {
  const by = (s: ReportEntry["status"]) => report.entries.filter((e) => e.status === s);
  const changed = by("changed").sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  const added = by("added");
  const removed = by("removed");
  const live = by("live");
  const unchanged = by("unchanged");
  const failed = by("failed");
  const max = opts.maxImages ?? 24;
  let shown = 0;
  const img = (rel: string | undefined, alt: string) => {
    if (!rel) return "_none_";
    shown++;
    return `<img src="${imageUrl(rel)}" alt="${alt}" width="100%">`;
  };

  const out: string[] = [SHOTS_MARKER, "## Screenshots of this change", ""];
  const parts = [
    changed.length && `**${changed.length} changed**`,
    added.length && `${added.length} new`,
    removed.length && `${removed.length} removed`,
    live.length && `${live.length} live`,
    unchanged.length && `${unchanged.length} unchanged`,
    failed.length && `${failed.length} failed to load`,
  ].filter(Boolean);
  out.push(`${parts.join(", ")}. Base \`${report.baseLabel}\`, head \`${report.headLabel}\`.`, "");
  if (changed.length === 0 && added.length === 0 && removed.length === 0) {
    out.push("No visual change in the captured views.", "");
  }

  for (const e of changed) {
    const open = shown < max ? " open" : "";
    out.push(
      `<details${open}><summary><b>${label(e)}</b>: ${pct(e.ratio)} of pixels changed (<code>${e.path}</code>)</summary>`,
      "",
      "| Before | After |",
      "| --- | --- |",
      `| ${img(e.base, `${e.name} before`)} | ${img(e.head, `${e.name} after`)} |`,
      "",
      `Changed pixels in red: ${img(e.diff, `${e.name} diff`)}`,
      "</details>",
      "",
    );
  }
  for (const e of added) {
    out.push(`<details><summary><b>${label(e)}</b>: new view (<code>${e.path}</code>)</summary>`, "", img(e.head, e.name), "</details>", "");
  }
  for (const e of removed) {
    out.push(`<details><summary><b>${label(e)}</b>: removed (<code>${e.path}</code>)</summary>`, "", img(e.base, e.name), "</details>", "");
  }
  if (live.length) {
    out.push(
      "<details><summary>Live views (data streams while agents run, so they are shown, not diffed)</summary>",
      "",
      "| View | Before | After |",
      "| --- | --- | --- |",
      ...live.map((e) => `| ${label(e)} | ${img(e.base, `${e.name} before`)} | ${img(e.head, `${e.name} after`)} |`),
      "</details>",
      "",
    );
  }
  if (unchanged.length) {
    out.push(`<details><summary>Unchanged (${unchanged.length})</summary>`, "", unchanged.map((e) => `- ${label(e)}`).join("\n"), "</details>", "");
  }
  if (failed.length) {
    out.push("**Failed to load:**", "", ...failed.map((e) => `- ${label(e)} (\`${e.path}\`)`), "");
  }
  out.push(
    "---",
    `_Captured with headless Chromium by Garry${opts.runUrl ? ` in [this run](${opts.runUrl})` : ""}. Updated on every push while the pull request is in review._`,
  );
  return out.join("\n");
}
