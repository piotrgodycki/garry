import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

/**
 * Security audit for skills. A skill is instructions (and sometimes scripts) that
 * an agent follows with access to the repositories, the tokens and a shell, so a
 * malicious or careless skill is a real attack path. Every skill is audited: on
 * install, every time local skills are loaded (so a file edited on disk after
 * install is caught), and the pre-installed ones in CI.
 *
 * The audit is static and deterministic: rules over the text of every file. It
 * looks for prompt injection, hidden content, remote code execution, destructive
 * commands, secret exfiltration, persistence, safety bypasses, obfuscation and
 * supply chain risk. A critical or high finding fails the audit (the skill cannot
 * be installed and is left out of every plan); a medium finding is a warning the
 * human has to acknowledge.
 */

export const AUDIT_VERSION = 1;

export type Severity = "critical" | "high" | "medium" | "low";
export type Verdict = "pass" | "warn" | "fail";

export interface Finding {
  rule: string;
  title: string;
  severity: Severity;
  why: string;
  file: string;
  line: number;
  excerpt: string;
}

export interface AuditReport {
  version: number;
  verdict: Verdict;
  counts: Record<Severity, number>;
  findings: Finding[];
  files: number;
  /** sha256 over every audited file, so a later change is detectable */
  hash: string;
}

export interface AuditFile {
  rel: string;
  data: Buffer;
}

interface Rule {
  id: string;
  title: string;
  severity: Severity;
  why: string;
  /** which files: instructions (markdown and text), code (scripts), or both */
  in: "doc" | "code" | "any";
  test: (line: string) => boolean;
}

const re = (r: RegExp) => (line: string) => r.test(line);

// Secrets and the places they leave through. Either alone is worth a look; both
// on one line is how exfiltration reads.
const SECRET = /\b(GITHUB_TOKEN|GARRY_GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY|AWS_(SECRET_ACCESS_KEY|ACCESS_KEY_ID|SESSION_TOKEN)|PRIVATE[_ ]KEY)\b|~?\/?\.ssh\b|\bid_(rsa|ed25519|ecdsa)\b|\.npmrc\b|\.netrc\b|\.aws\/credentials|(^|[\s"'`/])\.env(\.\w+)?\b|\bkeychain\b|\bprocess\.env\b|\bos\.environ\b|\bprintenv\b/i;
const SINK = /\b(curl|wget|nc|ncat|netcat|scp|rsync|ftp)\b|\bfetch\s*\(|\baxios\b|\brequests\.(post|put|get)\b|\bhttps?:\/\/|\bwebhook\b|\bupload\b|\bsend\s+(it|them|the\s+\w+)\s+to\b/i;

const RULES: Rule[] = [
  // ---- critical: direct compromise of the machine or the agent ----
  {
    id: "remote-code-exec",
    title: "Downloads code and runs it",
    severity: "critical",
    why: "Piping a download into a shell runs whatever the server returns, unreviewed.",
    in: "any",
    test: re(/\b(curl|wget|iwr|Invoke-WebRequest)\b[^\n]*\|\s*(sudo\s+)?(ba|z|da|fi)?sh\b|\b(curl|wget)\b[^\n]*\|\s*(python3?|node|perl|ruby)\b|\biex\s*\(\s*(New-Object|iwr|Invoke-WebRequest)/i),
  },
  {
    id: "decode-and-exec",
    title: "Decodes a hidden payload and runs it",
    severity: "critical",
    why: "Encoded commands hide what actually runs from the reviewer.",
    in: "any",
    test: re(/base64\s+(-d|--decode|-D)\b[^\n]*\|\s*(ba|z)?sh\b|\beval\s*\(\s*(atob|Buffer\.from)\s*\(|\beval\s+"?\$\(\s*echo[^\n]*base64|exec\s*\(\s*(base64\.b64decode|codecs\.decode)/i),
  },
  {
    id: "reverse-shell",
    title: "Opens a remote shell",
    severity: "critical",
    why: "Gives someone else interactive control of this machine.",
    in: "any",
    test: re(/\/dev\/tcp\/|\bbash\s+-i\s*>&|\bnc(at)?\s+(-\w+\s+)*-[ec]\s|\bmkfifo\s+\/tmp\/|\bsocat\b[^\n]*\bexec:|\bpty\.spawn\s*\(/i),
  },
  {
    id: "destructive-command",
    title: "Destroys files or the system",
    severity: "critical",
    why: "Wipes the disk, the home folder or the repository, or crashes the machine.",
    in: "any",
    test: re(/\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(--no-preserve-root\s+)?(\/|~|\$HOME|\/\*|\*|\.\/?\*?)(\s|$)|\bmkfs(\.\w+)?\s|\bdd\s+if=[^\n]*\bof=\/dev\/(sd|nvme|disk|hd)|:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:|\bshred\s+[^\n]*\/dev\//i),
  },
  {
    id: "secret-exfiltration",
    title: "Sends secrets somewhere",
    severity: "critical",
    why: "Reads a token, key or credential file and passes it to a network command or URL.",
    in: "any",
    test: (line) => SECRET.test(line) && SINK.test(line),
  },
  {
    id: "prompt-override",
    title: "Tells the agent to ignore its instructions",
    severity: "critical",
    why: "Classic prompt injection: replaces the rules the agent and the human agreed on.",
    in: "doc",
    test: re(/\b(ignore|disregard|forget|override|bypass)\s+(all\s+|any\s+|every\s+)?(of\s+)?(the\s+|your\s+|my\s+)?(previous|prior|above|earlier|preceding|system|original|other|safety)\s+(instructions?|prompts?|rules|guidelines|messages|directives|constraints)/i),
  },

  // ---- high: deception, privilege, persistence, unreviewable content ----
  {
    id: "deceive-human",
    title: "Hides actions from the human",
    severity: "high",
    why: "A skill must never ask the agent to conceal what it does from the person it works for.",
    in: "doc",
    test: re(/\b(do\s+not|don'?t|never)\s+(tell|inform|mention|reveal|show|report|notify)\s+(this\s+to\s+)?(the\s+)?(user|human|reviewer|owner|operator)|\bwithout\s+(telling|asking|notifying|informing)\s+(the\s+)?(user|human|reviewer)|\b(hide|conceal)\s+(this|it|these|the\s+\w+)\s+from\s+(the\s+)?(user|human|reviewer)|\bsilently\s+(push|delete|send|upload|modify|commit)/i),
  },
  {
    id: "role-hijack",
    title: "Tries to change who the agent is",
    severity: "high",
    why: "Role and persona overrides are a common way to switch off an agent's safeguards.",
    in: "doc",
    test: re(/\byou\s+are\s+now\s+(a|an|in|the|no\s+longer)\b|\bnew\s+system\s+prompt\b|\bact\s+as\s+(root|admin|an?\s+unrestricted|dan)\b|\bjailbreak|\bdeveloper\s+mode\s+(enabled|on)\b|\bno\s+(longer\s+)?(bound|restricted)\s+by\b/i),
  },
  {
    id: "safety-bypass",
    title: "Switches off a safeguard",
    severity: "high",
    why: "Skipping hooks, reviews, approvals or permissions removes the checks that keep changes safe.",
    in: "any",
    test: re(/--no-verify\b|--dangerously[\w-]*|\bbypassPermissions\b|\bskip[-_ ]?permissions\b|\bgit\s+push\s+[^\n]*(--force\b|-f\b)|\bchmod\s+(-R\s+)?(0?777|a\+rwx)\b|\bsudo\s+\w|\b(disable|turn\s+off|skip|bypass)\s+(the\s+)?(code\s+review|review|approvals?|safety|security\s+checks?|sandbox|tests|ci|branch\s+protection)\b/i),
  },
  {
    id: "persistence",
    title: "Makes itself permanent on the machine",
    severity: "high",
    why: "Writing to shell profiles, cron, services or system files keeps code running after the task.",
    in: "any",
    test: re(/>>?\s*["']?(~|\$HOME)?\/?\.(bashrc|zshrc|profile|bash_profile|zprofile|config\/fish)\b|\bcrontab\s+(-\w+\s+)*-?\s*$|\bcrontab\s+-[el]?\s*[^\n]*\||\bcrontab\s+\S+\.cron|\blaunchctl\s+(load|bootstrap)|\bsystemctl\s+(--user\s+)?enable\b|\/etc\/(passwd|shadow|sudoers|crontab|rc\.local)\b|\bauthorized_keys\b/i),
  },
  {
    id: "suspicious-host",
    title: "Talks to a throwaway or raw address",
    severity: "high",
    why: "Raw IPs, link shorteners, paste sites and tunnels are how payloads are fetched and data is dropped.",
    in: "any",
    test: re(/\bhttps?:\/\/(\d{1,3}\.){3}\d{1,3}\b|\bhttps?:\/\/[^\s/]*\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|pastebin\.com|paste\.ee|hastebin|ghostbin|transfer\.sh|file\.io|ngrok(-free)?\.(io|app)|trycloudflare\.com|requestbin|pipedream\.net|webhook\.site|interact\.sh|burpcollaborator)\b/i),
  },
  {
    id: "obfuscation",
    title: "Contains an encoded or obfuscated blob",
    severity: "high",
    why: "Long encoded strings cannot be reviewed and usually hide a payload.",
    in: "any",
    test: re(/[A-Za-z0-9+/]{200,}={0,2}|(\\x[0-9a-fA-F]{2}){24,}|(\\u[0-9a-fA-F]{4}){24,}|String\.fromCharCode\s*\(\s*\d+(\s*,\s*\d+){20,}/),
  },
  {
    id: "ci-tampering",
    title: "Changes CI, hooks or repository protection",
    severity: "high",
    why: "Editing workflows or git hooks can run code with the repository's secrets on every push.",
    in: "doc",
    test: re(/\b(edit|modify|change|write|overwrite|add\s+to|append\s+to|delete|remove)\s+[^\n]{0,40}(\.github\/workflows|\.git\/hooks|\.husky\/|CODEOWNERS|branch\s+protection)/i),
  },

  // ---- medium: needs a human look ----
  {
    id: "secret-access",
    title: "Reads secrets or credentials",
    severity: "medium",
    why: "A skill rarely needs tokens or key files directly; check that it only uses them where intended.",
    in: "any",
    test: re(SECRET),
  },
  {
    id: "package-install",
    title: "Installs packages",
    severity: "medium",
    why: "New dependencies are supply chain risk: check the names (typosquatting) and pin versions.",
    in: "any",
    test: re(/\b(npm|pnpm|yarn|bun)\s+(i|install|add)\s+(-[-\w]+\s+)*[@a-z0-9]|\bnpx\s+(-y\s+|--yes\s+)?[@a-z0-9]|\bpip3?\s+install\s+[^-\s]|\bgem\s+install\b|\bcargo\s+install\b|\bgo\s+install\b|\bbrew\s+install\b|\bapt(-get)?\s+install\b/i),
  },
  {
    id: "process-exec",
    title: "Runs system commands from code",
    severity: "medium",
    why: "Scripts that start processes can do anything the user can; check every command.",
    in: "code",
    test: re(/\bchild_process\b|\bexecSync\s*\(|\bexec(File)?\s*\(|\bspawn(Sync)?\s*\(|\beval\s*\(|\bnew\s+Function\s*\(|\bsubprocess\.|\bos\.system\s*\(|\bos\.popen\s*\(|Runtime\.getRuntime\(\)\.exec/),
  },
  {
    id: "external-url",
    title: "Reaches an external site",
    severity: "medium",
    why: "Network access beyond well known documentation and package hosts deserves a check.",
    in: "any",
    test: (line) => {
      const urls = line.match(/\bhttps?:\/\/[^\s)"'`<>]+/gi) ?? [];
      return urls.some((u) => {
        let host = "";
        try {
          host = new URL(u).hostname.toLowerCase();
        } catch {
          return true;
        }
        return !TRUSTED_HOSTS.some((t) => host === t || host.endsWith(`.${t}`));
      });
    },
  },
  {
    id: "broad-tools",
    title: "Asks for unrestricted tools",
    severity: "medium",
    why: "allowed-tools with a wildcard or a bare shell gives the skill every command.",
    in: "doc",
    test: (line) => {
      const m = /^\s*allowed[-_]tools\s*:(.*)$/i.exec(line);
      if (!m) return false;
      // a scoped tool like Bash(pnpm test:*) is fine; a bare shell or a wildcard is not
      return m[1]
        .replace(/[[\]"']/g, "")
        .split(",")
        .map((t) => t.trim())
        .some((t) => t === "*" || /^Bash$/i.test(t) || /^\w+\(\s*\*\s*\)$/.test(t));
    },
  },
];

const TRUSTED_HOSTS = [
  "github.com",
  "githubusercontent.com",
  "npmjs.com",
  "npmjs.org",
  "nodejs.org",
  "developer.mozilla.org",
  "anthropic.com",
  "claude.ai",
  "claude.com",
  "typescriptlang.org",
  "react.dev",
  "vitejs.dev",
  "vite.dev",
  "nextjs.org",
  "module-federation.io",
  "playwright.dev",
  "json-schema.org",
  "spec.openapis.org",
  "asyncapi.com",
  "semver.org",
  "w3.org",
  "localhost",
  "example.com",
  "example.org",
];

const DOC_EXT = new Set([".md", ".markdown", ".txt", ".yaml", ".yml", ".json", ""]);

// Characters a human cannot see: bidirectional overrides (Trojan Source), Unicode
// tags (invisible prompt text) and zero width characters.
const BIDI = /[‪-‮⁦-⁩]/;
const TAGS = /[\u{E0000}-\u{E007F}]/u;
const ZERO_WIDTH = /[​-‍⁠᠎]|(?!^)﻿/;

const visible = (s: string) =>
  s
    .replace(/[‪-‮⁦-⁩​-‍⁠᠎﻿]/g, (c) => `<U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}>`)
    .replace(/[\u{E0000}-\u{E007F}]/gu, "<TAG>")
    .trim()
    .slice(0, 180);

function isBinary(data: Buffer): boolean {
  const n = Math.min(data.length, 8000);
  for (let i = 0; i < n; i++) if (data[i] === 0) return true;
  return false;
}

/** Audits a skill's files and returns every finding with a verdict. */
export function auditFiles(files: AuditFile[]): AuditReport {
  const findings: Finding[] = [];
  const add = (r: Pick<Finding, "rule" | "title" | "severity" | "why">, file: string, line: number, excerpt: string) =>
    findings.push({ ...r, file, line, excerpt: visible(excerpt) });

  for (const f of files) {
    if (isBinary(f.data)) {
      add(
        { rule: "binary-file", title: "Contains a binary file", severity: "high", why: "Compiled or binary content cannot be reviewed; ship source instead." },
        f.rel,
        0,
        `${f.data.length} bytes`,
      );
      continue;
    }
    const text = f.data.toString("utf8");
    const kind = DOC_EXT.has(extname(f.rel).toLowerCase()) ? "doc" : "code";

    if (TAGS.test(text) || BIDI.test(text)) {
      const lineNo = text.split("\n").findIndex((l) => TAGS.test(l) || BIDI.test(l)) + 1;
      add(
        { rule: "hidden-unicode", title: "Hides text with invisible characters", severity: "critical", why: "Bidirectional overrides and Unicode tag characters show one thing to a human and another to the agent." },
        f.rel,
        lineNo,
        text.split("\n")[lineNo - 1] ?? "",
      );
    }
    if (ZERO_WIDTH.test(text)) {
      const lineNo = text.split("\n").findIndex((l, i) => (i === 0 ? ZERO_WIDTH.test(l.replace(/^﻿/, "")) : ZERO_WIDTH.test(l))) + 1;
      add(
        { rule: "zero-width", title: "Contains zero width characters", severity: "high", why: "Invisible characters can split words to slip past review or smuggle instructions." },
        f.rel,
        Math.max(lineNo, 1),
        text.split("\n")[Math.max(lineNo, 1) - 1] ?? "",
      );
    }
    if (kind === "doc") {
      for (const m of text.matchAll(/<!--([\s\S]*?)-->/g)) {
        if (!m[1].trim()) continue;
        const lineNo = text.slice(0, m.index).split("\n").length;
        add(
          { rule: "html-comment", title: "Has text hidden in an HTML comment", severity: "medium", why: "Comments do not show in a rendered preview but the agent still reads them." },
          f.rel,
          lineNo,
          m[0],
        );
      }
    }

    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (kind === "code" && line.length > 1000) {
        add(
          { rule: "minified-code", title: "Has minified or one line code", severity: "medium", why: "Very long lines are hard to review and often minified or generated." },
          f.rel,
          i + 1,
          line,
        );
      }
      for (const r of RULES) {
        if (r.in !== "any" && r.in !== kind) continue;
        if (r.test(line)) add({ rule: r.id, title: r.title, severity: r.severity, why: r.why }, f.rel, i + 1, line);
      }
    });
  }

  // a line that is exfiltration is not also "secret access": keep the worse finding
  const exfil = new Set(findings.filter((f) => f.rule === "secret-exfiltration").map((f) => `${f.file}:${f.line}`));
  const deduped = findings.filter((f) => !(f.rule === "secret-access" && exfil.has(`${f.file}:${f.line}`)));

  const order: Severity[] = ["critical", "high", "medium", "low"];
  deduped.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || a.file.localeCompare(b.file) || a.line - b.line);
  const counts = { critical: 0, high: 0, medium: 0, low: 0 } as Record<Severity, number>;
  for (const f of deduped) counts[f.severity]++;
  const verdict: Verdict = counts.critical + counts.high > 0 ? "fail" : counts.medium > 0 ? "warn" : "pass";

  const hash = createHash("sha256");
  for (const f of [...files].sort((a, b) => a.rel.localeCompare(b.rel))) {
    hash.update(f.rel);
    hash.update("\0");
    hash.update(f.data);
  }
  return { version: AUDIT_VERSION, verdict, counts, findings: deduped, files: files.length, hash: hash.digest("hex") };
}

/** Reads every regular file of a skill folder (no symlinks, no dot folders) for the audit. */
export function readSkillFolder(folder: string): AuditFile[] {
  const out: AuditFile[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === "garry.json") continue;
      const abs = join(d, entry);
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (!entry.startsWith(".")) walk(abs);
      } else if (st.isFile()) out.push({ rel: relative(folder, abs), data: readFileSync(abs) });
    }
  };
  walk(folder);
  return out;
}

/** The rules, for documentation and the UI. */
export const AUDIT_RULES = RULES.map(({ id, title, severity, why }) => ({ id, title, severity, why }));
