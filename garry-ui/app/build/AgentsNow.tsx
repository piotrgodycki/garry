import type { Project, Thread } from "garry-client";
import Link from "../lib/router";
import styles from "./agentsNow.module.css";

const ORDER = { "needs-you": 0, working: 1, done: 2 } as const;
const STATE = { "needs-you": "Needs you", working: "Working", done: "Ready" } as const;

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString();
};

/**
 * Every agent at a glance: what each one is doing right now (the tool it is
 * using, the file it is in), what it is asking you, or that its work is ready.
 * Needs-you first, then working, then ready; a click opens the work.
 */
export default function AgentsNow({ threads, projects }: { threads: Thread[]; projects: Project[] }) {
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const live = threads
    .filter((t): t is Thread & { attention: keyof typeof ORDER } => Boolean(t.attention))
    .sort((a, b) => ORDER[a.attention] - ORDER[b.attention] || b.updatedAt.localeCompare(a.updatedAt));
  const count = (s: keyof typeof ORDER) => live.filter((t) => t.attention === s).length;

  return (
    <section className={`card ${styles.panel}`} aria-label="agents now">
      <div className={styles.head}>
        <span className="eyebrow">Agents now</span>
        <span className={styles.counts}>
          {live.length === 0 ? (
            "No agent is working. Start one below."
          ) : (
            <>
              {count("needs-you") > 0 && <span className="badge danger">{count("needs-you")} need you</span>}
              {count("working") > 0 && <span className="badge run">{count("working")} working</span>}
              {count("done") > 0 && <span className="badge ok">{count("done")} ready</span>}
            </>
          )}
        </span>
      </div>
      {live.length > 0 && (
        <ul className={styles.list}>
          {live.map((t) => (
            <li key={t.id}>
              <Link href={`/build/${t.id}`} className={`${styles.row} ${styles[t.attention.replace("-", "")]}`} title={`${t.title}: ${t.activity ?? STATE[t.attention]}`}>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.what}>
                  <span className={styles.title}>{t.title}</span>
                  <span className={styles.activity}>
                    <span className={styles.state}>{STATE[t.attention]}</span>
                    {t.attention !== "done" && t.activity && t.activity !== STATE[t.attention] && <span className={styles.doing}>{t.activity}</span>}
                  </span>
                </span>
                <span className={styles.where}>
                  <span>{names.get(t.projectId) ?? t.projectId}</span>
                  <span>{ago(t.updatedAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
