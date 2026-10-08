#!/usr/bin/env node
// Fails if any forbidden dash character appears in tracked text files.
// The project rule is plain ASCII punctuation only: no em dash, en dash,
// figure dash or horizontal bar. The forbidden characters are built from
// their code points so this file itself stays clean.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FORBIDDEN = [0x2012, 0x2013, 0x2014, 0x2015].map((c) => String.fromCodePoint(c));
const forbiddenRe = new RegExp(`[${FORBIDDEN.join("")}]`);

const ALLOWED_EXT = /\.(md|mdx|ts|tsx|js|mjs|cjs|json|yml|yaml)$/;
const SKIP = /(^|\/)(package-lock\.json)$|(^|\/)(node_modules|dist)\//;

const files = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean)
  .filter((f) => ALLOWED_EXT.test(f) && !SKIP.test(f));

const violations = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  content.split("\n").forEach((line, i) => {
    if (forbiddenRe.test(line)) violations.push(`${file}:${i + 1}: ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error("Forbidden dash characters found. Use plain ASCII punctuation:");
  for (const v of violations) console.error("  " + v);
  console.error(`\n${violations.length} line(s) with forbidden dashes.`);
  process.exit(1);
}

console.log(`No forbidden dash characters found (${files.length} files scanned).`);
