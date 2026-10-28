#!/usr/bin/env node
import { validateRegistry, hasErrors } from "./validate.js";

const root = process.argv[2] ?? ".";
const issues = validateRegistry(root);

if (issues.length === 0) {
  console.log(`✓ registry OK (${root})`);
  process.exit(0);
}

for (const i of issues) {
  const mark = i.level === "error" ? "✗" : "⚠";
  console.log(`${mark} [${i.where}] ${i.message}`);
}

const errors = issues.filter((i) => i.level === "error").length;
const warns = issues.length - errors;
console.log(`\n${errors} error(s), ${warns} warning(s)`);
process.exit(hasErrors(issues) ? 1 : 0);
