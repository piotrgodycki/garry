#!/usr/bin/env node
// Generates app/tokens.css (CSS custom properties) from a design-tokens.json.
// White label: a company rebrands by overriding the source tokens (or tokens.css)
// without forking the UI or recompiling components.
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2] ?? "../garry-registry/examples/registry-sample/contracts/design-tokens.json";
const tokens = JSON.parse(readFileSync(src, "utf8"));

const lines = [];
const walk = (obj, path) => {
  for (const [k, v] of Object.entries(obj)) {
    const next = [...path, k];
    if (v && typeof v === "object") walk(v, next);
    else lines.push(`  --${next.join("-")}: ${v};`);
  }
};
walk(tokens, []);

writeFileSync("app/tokens.css", `:root {\n${lines.join("\n")}\n}\n`);
console.log(`wrote app/tokens.css (${lines.length} tokens from ${src})`);
