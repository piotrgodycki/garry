/**
 * Regression test for the human QA check: which changes need a person to try
 * them, and which do not. Run with: pnpm -C garry-tool test:qa (CI runs it too).
 */
import { QA_MARKER, assessQa, parseDiff, qaMarkdown, type ChangedFile } from "./qa.js";

let failed = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failed++;
};
const areas = (files: ChangedFile[]) => assessQa(files).areas.map((a) => a.id).sort().join(",");

expect("docs only need nobody", !assessQa([{ path: "README.md", added: ["<button onClick>"] }, { path: "docs/cli.md" }]).needed);
expect("tests only need nobody", !assessQa([{ path: "src/a.test.tsx", added: ["<div onClick={x} />"] }, { path: "garry-tool/src/x.selftest.ts", added: ["useState("] }]).needed);
expect("CI and lockfiles need nobody", !assessQa([{ path: ".github/workflows/ci.yml" }, { path: "pnpm-lock.yaml" }]).needed);
expect("server logic without UI needs nobody", !assessQa([{ path: "garry-tool/src/orchestrate/plan.ts", added: ["const x = 1;"] }]).needed);

expect("a stylesheet looks different", areas([{ path: "app/page.module.css", added: [".a { color: red }"] }]) === "ui");
expect("new markup looks different", areas([{ path: "app/Card.tsx", added: ['  return <div className="card">x</div>;'] }]) === "ui");
expect("a tsx file with only logic does not", areas([{ path: "app/lib/util.tsx", added: ["export const n = 1;"] }]) === "");
expect("a new handler behaves differently", areas([{ path: "app/Form.tsx", added: ["  <button onClick={save}>Save</button>"] }]) === "interaction,ui");
expect("React Native presses count", areas([{ path: "garry-mobile/app/new.tsx", added: ["<Pressable onPress={go} />"] }]) === "interaction,mobile,ui");
expect("a new env variable is a setting", areas([{ path: "src/server.ts", added: ["const port = process.env.GARRY_PORT;"] }]) === "settings");
expect("app.json is a setting", areas([{ path: "garry-mobile/app.json", added: ['"name": "Garry"'] }]).includes("settings"));
expect("auth code is security", areas([{ path: "garry-tool/src/server/auth.ts", added: ["return token;"] }]) === "security");
expect("Touch ID is security", areas([{ path: "garry-desktop/src/touchid.ts", added: ["await systemPreferences.promptTouchID(r);"] }]) === "desktop,security");
expect("a header check is security", areas([{ path: "src/server/routes.ts", added: ['  const bearer = req.headers.authorization?.startsWith("Bearer ");'] }]) === "security");
expect("the words alone are not", areas([{ path: "src/notes.ts", added: ["// we call promptTouchID and send an Authorization header", "const re = /promptTouchID|Authorization/;"] }]) === "");
expect("a schema change is saved data", areas([{ path: "garry-registry/src/schema.ts", added: ["stackRef: z.string().optional(),"] }]) === "data");

const diff = parseDiff(
  [
    "diff --git a/app/x.tsx b/app/x.tsx",
    "--- a/app/x.tsx",
    "+++ b/app/x.tsx",
    "@@ -1 +1,2 @@",
    " keep",
    '+<button onClick={go}>Go</button>',
    "diff --git a/README.md b/README.md",
    "+++ b/README.md",
    "+text",
  ].join("\n"),
);
expect("a unified diff is split per file with added lines", diff.length === 2 && diff[0].path === "app/x.tsx" && diff[0].added?.length === 1 && diff[0].added[0].startsWith("<button"));

const md = qaMarkdown(assessQa(diff));
expect("the comment has the marker, the badge and checkboxes", md.startsWith(QA_MARKER) && md.includes("needs%20a%20human") && md.includes("- [ ] "));
expect("an all clear comment says so", qaMarkdown({ needed: false, areas: [] }).includes("automated%20checks%20only"));

if (failed) {
  console.error(`${failed} QA check(s) failed`);
  process.exit(1);
}
console.log("QA checks passed");
