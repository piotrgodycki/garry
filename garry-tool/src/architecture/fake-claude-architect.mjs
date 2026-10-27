#!/usr/bin/env node
// A stand-in for claude in the architecture tests: answers with the JSON
// envelope claude --output-format json prints, suggesting a Neon database for
// whatever node needs one, plus one suggestion with a block that does not exist.
const args = process.argv.slice(2);
const prompt = args[args.indexOf("-p") + 1] ?? "";
const board = JSON.parse(/The board now[^\n]*\n(.*)\n/.exec(prompt)?.[1] ?? '{"nodes":[]}');
const first = board.nodes[0]?.id ?? "x";
const answer = {
  summary: "Add a database next to the API.",
  suggestions: [
    { title: "Use Neon for SQL", why: "Serverless Postgres that scales to zero.", add: [{ block: "neon" }], links: [{ from: first, to: "new:0", capability: "sql" }] },
    { title: "Made up", why: "Not a real block.", add: [{ block: "quantum-db" }], links: [{ from: first, to: "new:0", capability: "sql" }] },
  ],
};
process.stdout.write(JSON.stringify({ type: "result", subtype: "success", result: "Here you go:\n" + JSON.stringify(answer) }));
