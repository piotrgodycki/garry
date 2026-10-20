import styles from "./skills.module.css";
import { Icon } from "../icons";

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
  verdict: Verdict;
  counts: Record<Severity, number>;
  findings?: Finding[];
  files?: number;
}

const LABEL: Record<Verdict, string> = {
  pass: "Security audit passed",
  warn: "Security audit: warnings to review",
  fail: "Blocked by the security audit",
};

/** One line verdict for a skill card. */
export function AuditBadge({ audit }: { audit: AuditReport | null }) {
  if (!audit) return <span className={styles.auditNone}>Not audited: no instructions yet</span>;
  const { verdict, counts } = audit;
  const text =
    verdict === "pass"
      ? "Audit passed"
      : verdict === "warn"
        ? `${counts.medium} ${counts.medium === 1 ? "warning" : "warnings"}`
        : `Blocked: ${[counts.critical && `${counts.critical} critical`, counts.high && `${counts.high} high`].filter(Boolean).join(", ")}`;
  return (
    <span className={`${styles.audit} ${styles[`audit_${verdict}`]}`} title={LABEL[verdict]}>
      {verdict === "pass" ? Icon.check : Icon.alert}
      {text}
    </span>
  );
}

/** The full report: verdict, then every finding with where it is and why it matters. */
export function AuditFindings({ audit }: { audit: AuditReport }) {
  const findings = audit.findings ?? [];
  return (
    <div className={`${styles.report} ${styles[`report_${audit.verdict}`]}`}>
      <div className={styles.reportHead}>
        {audit.verdict === "pass" ? Icon.check : Icon.alert}
        <b>{LABEL[audit.verdict]}</b>
        {audit.files !== undefined && <span className={styles.reportMeta}>{audit.files} {audit.files === 1 ? "file" : "files"} scanned</span>}
      </div>
      {audit.verdict === "pass" && (
        <p className={styles.reportNote}>
          No prompt injection, hidden text, remote code, destructive commands, secret exfiltration, persistence, safety
          bypasses, obfuscation or supply chain risk found.
        </p>
      )}
      {findings.length > 0 && (
        <ul className={styles.findings}>
          {findings.map((f, i) => (
            <li key={i}>
              <span className={`${styles.sev} ${styles[`sev_${f.severity}`]}`}>{f.severity}</span>
              <div className={styles.findingText}>
                <span className={styles.findingTitle}>
                  {f.title} <code>{f.file}{f.line ? `:${f.line}` : ""}</code>
                </span>
                <span className={styles.findingWhy}>{f.why}</span>
                {f.excerpt && <code className={styles.excerpt}>{f.excerpt}</code>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
