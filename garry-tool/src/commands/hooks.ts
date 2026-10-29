import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { MAX_TOKENS, oversizedStaged, sizeMessage } from "../hooks/filesize.js";

const HELP = `garry hooks <command>

Commands:
  check [--max <tokens>]   refuse staged files over ${MAX_TOKENS} tokens (bytes / 4); what the pre-commit hook runs
  install [<repo>]         add the pre-commit hook to a repository (the current one by default); an existing
                           pre-commit hook is kept and runs first

Lockfiles, generated code (dist/, @generated, linguist-generated in .gitattributes) and binaries are skipped.
`;

const MARK = "# garry: file size";
const LINE = `${MARK}\nnpx --no-install garry hooks check || exit 1\n`;

/** garry hooks: the file size check, and putting it in a repository's pre-commit hook. */
export function runHooks(args: string[]): void {
  const [sub, ...rest] = args;
  if (sub === "check") {
    const at = rest.indexOf("--max");
    const max = at >= 0 ? Number(rest[at + 1]) : MAX_TOKENS;
    if (!Number.isFinite(max) || max <= 0) throw new Error("--max takes a number of tokens");
    const over = oversizedStaged(process.cwd(), max);
    if (over.length) {
      console.error(sizeMessage(over, max));
      process.exitCode = 1;
    }
    return;
  }
  if (sub === "install") {
    const repo = rest[0] ?? process.cwd();
    const hooks = execFileSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: repo, encoding: "utf8" }).trim();
    const dir = join(repo, hooks);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "pre-commit");
    const before = existsSync(file) ? readFileSync(file, "utf8") : "#!/bin/sh\n";
    if (before.includes(MARK)) return console.log(`the file size check is already in ${file}`);
    writeFileSync(file, `${before.replace(/\n*$/, "\n")}${LINE}`);
    chmodSync(file, 0o755);
    console.log(`added the file size check to ${file}`);
    return;
  }
  console.log(HELP);
  if (sub && sub !== "--help" && sub !== "-h") process.exitCode = 1;
}
