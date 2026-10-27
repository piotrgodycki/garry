import { execFileSync } from "node:child_process";
import pc from "picocolors";
import { GitHub, parseSlug } from "../github/client.js";
import { githubToken } from "../github/env.js";
import { QA_LABEL, QA_MARKER, assessQa, parseDiff, qaMarkdown } from "../review/qa.js";

const HELP = `garry qa [--base <ref>] [--json] [--pr <number> --repo <owner/name>]

Does this change need a person to try it? Reads the diff from <base> (default:
origin/main) to HEAD and names what a human should check: screens that look
different, controls that behave differently, settings, sign in and pairing,
the iPhone and Mac apps, saved data. Tests, docs and CI changes need nobody.

With --pr and --repo it updates the pull request: the "${QA_LABEL}" label on or
off, and one comment with a badge and the checklist (GARRY_GITHUB_TOKEN). CI
runs it on every pull request; Garry also adds it when it opens one.
`;

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function runQa(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return;
  }
  const base = flag(argv, "base") ?? "origin/main";
  const patch = execFileSync("git", ["diff", "--no-color", `${base}...HEAD`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const qa = assessQa(parseDiff(patch));
  const pr = Number(flag(argv, "pr"));
  const slug = parseSlug(flag(argv, "repo") ?? "");

  if (argv.includes("--json")) console.log(JSON.stringify(qa, null, 2));
  else if (!pr) {
    if (!qa.needed) console.log(pc.green("No human QA needed: tests and review cover this change."));
    for (const a of qa.areas) {
      console.log(pc.bold(`\n${a.label}`) + pc.dim(`  ${a.files.join(", ")}`));
      for (const c of a.checks) console.log(`  - ${c}`);
    }
  }

  if (pr && slug) {
    const token = githubToken();
    if (!token) throw new Error("set GARRY_GITHUB_TOKEN to update the pull request");
    const gh = new GitHub(token);
    await gh.setLabel(slug.owner, slug.name, pr, QA_LABEL, qa.needed, "f97316", "Someone has to try this before it ships");
    const c = await gh.upsertComment(slug.owner, slug.name, pr, QA_MARKER, qaMarkdown(qa));
    console.log(`${qa.needed ? `labelled "${QA_LABEL}"` : "no human QA needed"}: ${c.url}`);
  }
}
