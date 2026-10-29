import { useState, type ReactElement } from "react";
import type { Chain, Pair, Project, Thread } from "garry-client";
import Link from "../lib/router";
import { client } from "../lib/client";
import { Icon } from "../icons";
import Illustrated from "../Illustrations";
import styles from "./jobs.module.css";

type Kind = "needs" | "working" | "ready" | "done";
const FILTERS: { id: Kind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs", label: "Needs you" },
  { id: "working", label: "Working" },
  { id: "ready", label: "Ready to review" },
  { id: "done", label: "Done" },
];
const ORDER: Record<Kind, number> = { needs: 0, working: 1, ready: 2, done: 3 };

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString();
};
const kindOf = (t: Thread): Kind => (t.running || t.status === "running" ? "working" : t.attention === "needs-you" ? "needs" : t.pr || t.commit ? "done" : "ready");
const wordOf = (t: Thread, k: Kind) => (k === "needs" ? (t.status === "error" ? "Stopped, needs you" : "Needs your answer") : k === "working" ? "Working" : k === "ready" ? "Ready to review" : t.pr ? "Pull request open" : "Committed");
const pairKind: Record<Pair["status"], Kind> = { writing: "working", reviewing: "working", "needs-you": "needs", approved: "ready" };
const chainKind: Record<Chain["status"], Kind> = { running: "working", "needs-you": "needs", done: "ready", stopped: "done" };
const PAIR_WORD: Record<Pair["status"], string> = { writing: "Agent writing", reviewing: "Reviewer checking", "needs-you": "Needs you", approved: "Approved, ready to review" };
const CHAIN_WORD: Record<Chain["status"], string> = { running: "Working", "needs-you": "Needs you", done: "All steps done", stopped: "Stopped" };
const STEP_WORD = { waiting: "waiting", running: "working", done: "done", "needs-you": "needs you", dropped: "dropped" } as const;

type Job = { key: string; kind: Kind; at: string; node: ReactElement };

/**
 * Every job in the project's repositories, in one list: single agents, agents
 * with a reviewer, and jobs in several steps. Filter by what it needs; what
 * needs you comes first. Waiting steps can be moved, dropped and added to.
 */
export default function Jobs({ threads, teams, projects, onChange }: { threads: Thread[]; teams: { pairs: Pair[]; chains: Chain[] }; projects: Project[]; onChange: () => void }) {
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const act = (p: Promise<unknown>) => void p.then(() => (setError(null), onChange()), (e: Error) => setError(e.message));

  // the agents of a pair or a job in steps show inside it, not on their own
  const grouped = new Set<string>();
  for (const p of teams.pairs) [p.writer, p.reviewer].forEach((id) => id && grouped.add(id));
  for (const c of teams.chains) c.steps.forEach((s) => s.threadId && grouped.add(s.threadId));

  const jobs: Job[] = [
    ...threads
      .filter((t) => !grouped.has(t.id))
      .map((t) => {
        const kind = kindOf(t);
        return {
          key: t.id,
          kind,
          at: t.updatedAt,
          node: (
            <Link href={`/build/${t.id}`} className={styles.job} data-kind={kind} aria-label={`${t.title}: ${wordOf(t, kind)}`}>
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.jobMain}>
                <b>{t.title}</b>
                <span className={styles.jobLine}>
                  <span className={styles.state}>{wordOf(t, kind)}</span>
                  {kind !== "done" && kind !== "ready" && t.activity && <span className={styles.doing}>{t.activity}</span>}
                </span>
              </span>
              <span className={styles.where}>
                <span>{names.get(t.projectId) ?? ""}</span>
                <span>{ago(t.updatedAt)}</span>
              </span>
            </Link>
          ),
        };
      }),
    ...teams.pairs.map((p) => ({
      key: p.id,
      kind: pairKind[p.status],
      at: p.createdAt,
      node: (
        <article className={styles.job} data-kind={pairKind[p.status]} aria-label={`agent and reviewer: ${p.task}`}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.jobMain}>
            <b>{p.task.split("\n")[0]}</b>
            <span className={styles.jobLine}>
              <span className={styles.state}>{PAIR_WORD[p.status]}</span>
              <span className={styles.doing}>
                Agent and reviewer · round {Math.min(p.round + 1, p.maxRounds)} of {p.maxRounds}
              </span>
            </span>
            {p.lastReview && <span className={styles.review}>{p.lastReview}</span>}
          </span>
          <span className={styles.links}>
            <Link className="btn btnSm" href={`/build/${p.writer}`}>
              Agent
            </Link>
            {p.reviewer && (
              <Link className="btn btnSm" href={`/build/${p.reviewer}`}>
                Reviewer
              </Link>
            )}
          </span>
        </article>
      ),
    })),
    ...teams.chains.map((c) => {
      const waiting = c.steps.filter((s) => s.status === "waiting");
      const move = (id: string, by: number) => {
        const order = waiting.map((s) => s.id);
        const i = order.indexOf(id);
        [order[i], order[i + by]] = [order[i + by], order[i]];
        act(client.reorderChain(c.id, order));
      };
      const shown = c.steps.filter((s) => s.status !== "dropped");
      return {
        key: c.id,
        kind: chainKind[c.status],
        at: c.createdAt,
        node: (
          <article className={styles.job} data-kind={chainKind[c.status]} aria-label={`job in steps: ${c.name}`}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.jobMain}>
              <b>{c.name}</b>
              <span className={styles.jobLine}>
                <span className={styles.state}>{CHAIN_WORD[c.status]}</span>
                <span className={styles.doing}>
                  {shown.filter((s) => s.status === "done").length} of {shown.length} steps done
                </span>
              </span>
              <ol className={styles.chainSteps}>
                {shown.map((s, i) => {
                  const w = waiting.indexOf(s);
                  return (
                    <li key={s.id} data-status={s.status}>
                      <span className={styles.stepNo}>{i + 1}</span>
                      <span className={styles.stepText}>{s.prompt.split("\n")[0]}</span>
                      <span className={styles.stepState}>{STEP_WORD[s.status]}</span>
                      {s.threadId && (
                        <Link className="btn btnSm btnGhost" href={`/build/${s.threadId}`}>
                          Open
                        </Link>
                      )}
                      {w >= 0 && (
                        <span className={styles.stepActs}>
                          <button type="button" className="btn btnSm btnGhost" aria-label={`move up: ${s.prompt}`} disabled={w === 0} onClick={() => move(s.id, -1)}>
                            ↑
                          </button>
                          <button type="button" className="btn btnSm btnGhost" aria-label={`move down: ${s.prompt}`} disabled={w === waiting.length - 1} onClick={() => move(s.id, 1)}>
                            ↓
                          </button>
                          <button type="button" className="btn btnSm btnGhost" aria-label={`drop: ${s.prompt}`} onClick={() => act(client.dropChainStep(c.id, s.id))}>
                            {Icon.close}
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {c.status !== "stopped" && (
                <form
                  className={styles.addStep}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = adding[c.id]?.trim();
                    if (text) act(client.addChainStep(c.id, text).then(() => setAdding((a) => ({ ...a, [c.id]: "" }))));
                  }}
                >
                  <input className="input" aria-label={`add a step to ${c.name}`} placeholder="e.g. Then update the docs" value={adding[c.id] ?? ""} onChange={(e) => setAdding((a) => ({ ...a, [c.id]: e.target.value }))} />
                  <button className="btn btnSm" type="submit" disabled={!adding[c.id]?.trim()}>
                    Add a step
                  </button>
                  {(c.status === "running" || c.status === "needs-you") && (
                    <button type="button" className="btn btnSm btnGhost" onClick={() => act(client.stopChain(c.id))}>
                      Stop after this step
                    </button>
                  )}
                </form>
              )}
            </span>
          </article>
        ),
      };
    }),
  ].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.at.localeCompare(a.at));

  const count = (k: Kind) => jobs.filter((j) => j.kind === k).length;
  const visible = jobs.filter((j) => filter === "all" || j.kind === filter);
  return (
    <section className={styles.jobs} aria-labelledby="your-jobs">
      <div className={styles.jobsHead}>
        <h2 id="your-jobs" className={styles.cardTitle}>
          Your jobs
        </h2>
        <div className={styles.filters} role="radiogroup" aria-label="show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
              {f.id !== "all" && count(f.id) > 0 && <span className={styles.count}>{count(f.id)}</span>}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <span className="badge danger" role="alert">
          {error}
        </span>
      )}
      {jobs.length === 0 ? (
        <Illustrated art="plantFeature" title="No jobs yet">
          Start one above: describe a change and an agent works on it in its own branch.
        </Illustrated>
      ) : visible.length === 0 ? (
        <p className={styles.none}>Nothing here right now.</p>
      ) : (
        <ul className={styles.list}>
          {visible.map((j) => (
            <li key={j.key}>{j.node}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
