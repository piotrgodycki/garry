#!/usr/bin/env node
// A stand-in for the claude command in tests: prints the same stream-json
// shapes, appends the prompt to NOTES.md in the working directory, and reports
// --resume so the test can check that follow-ups continue the session.
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
const prompt = args[args.indexOf("-p") + 1] ?? "";
const resume = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : null;
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");

if (prompt.includes("SLOW")) await new Promise((r) => setTimeout(r, 30000));
out({ type: "system", subtype: "init", session_id: resume ?? "fake-session-1" });
out({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "NOTES.md" } }] } });
// BUSY keeps working after its first tool, so what it is doing can be seen
if (prompt.includes("BUSY")) await new Promise((r) => setTimeout(r, 30000));
appendFileSync("NOTES.md", `${prompt}\n`);
out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "File written" }] } });
// ASK ends the turn with a question to the person; FAIL ends it with an error
const text = prompt.includes("ASK") ? "I added the button.\nShould it be red or blue?" : resume ? `resumed ${resume}` : "wrote NOTES.md";
out({ type: "assistant", message: { content: [{ type: "text", text }] } });
const failed = prompt.includes("FAIL");
out({ type: "result", subtype: failed ? "error_during_execution" : "success", is_error: failed, total_cost_usd: 0.01, session_id: resume ?? "fake-session-1" });
