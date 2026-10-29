import { useCallback, useEffect, useState } from "react";
import type { Chain, ChainStep, Pair } from "garry-client";
import Link from "../lib/router";
import { client } from "../lib/client";
import { Icon } from "../icons";
import styles from "./build.module.css";

const PAIR_WORD: Record<Pair["status"], [string, string]> = { writing: ["Writing", "run"], reviewing: ["Reviewing", "run"], approved: ["Approved", "ok"], "needs-you": ["Needs you", "warn"] };
const CHAIN_WORD: Record<Chain["status"], [string, string]> = { running: ["Running", "run"], "needs-you": ["Needs you", "warn"], done: ["Done", "ok"], stopped: ["Stopped", ""] };
const STEP_WORD: Record<ChainStep["status"], string> = { waiting: "waiting", running: "working", done: "done", "needs-you": "needs you", dropped: "dropped" };

/**
 * Agents working together: each pair (who writes, who reviews, which round)
 * and each chain (its steps in order). The steps that have not started can be
 * moved, dropped and added to; a chain can be stopped.
 */
export default function Together() {
  const [teams, setTeams] = useState<{ pairs: Pair[]; chains: Chain[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const load = useCallback(() => client.teams().then(setTeams, () => undefined), []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);
  const act = (p: Promise<unknown>) =>
    void p.then(
      () => (setError(null), load()),
      (e: Error) => setError(e.message),
    );

  if (!teams || (teams.pairs.length === 0 && teams.chains.length === 0)) return null;
  return (
    <section className={styles.together} aria-labelledby="together">
      <h2 id="together" className="eyebrow">
        Together
      </h2>
      {error && <span className="badge danger">{error}</span>}
      {teams.pairs
        .slice()
        .reverse()
        .map((p) => (
          <article key={p.id} className={`card ${styles.team}`} aria-label={`pair: ${p.task}`}>
            <div className={styles.teamHead}>
              <b>{p.task.split("\n")[0]}</b>
              <span className={`badge ${PAIR_WORD[p.status][1]}`}>{PAIR_WORD[p.status][0]}</span>
            </div>
            <span className={styles.meta}>
              A writer and a reviewer · round {Math.min(p.round + 1, p.maxRounds)} of {p.maxRounds}
            </span>
            <div className={styles.row}>
              <Link className="btn btnSm" href={`/build/${p.writer}`}>
                Writer
              </Link>
              {p.reviewer && (
                <Link className="btn btnSm" href={`/build/${p.reviewer}`}>
                  Reviewer
                </Link>
              )}
            </div>
            {p.lastReview && <p className={styles.review}>{p.lastReview}</p>}
          </article>
        ))}
      {teams.chains
        .slice()
        .reverse()
        .map((c) => {
          const waiting = c.steps.filter((s) => s.status === "waiting");
          const move = (id: string, by: number) => {
            const order = waiting.map((s) => s.id);
            const i = order.indexOf(id);
            [order[i], order[i + by]] = [order[i + by], order[i]];
            act(client.reorderChain(c.id, order));
          };
          return (
            <article key={c.id} className={`card ${styles.team}`} aria-label={`chain: ${c.name}`}>
              <div className={styles.teamHead}>
                <b>{c.name}</b>
                <span className={`badge ${CHAIN_WORD[c.status][1]}`}>{CHAIN_WORD[c.status][0]}</span>
              </div>
              <ol className={styles.chainSteps}>
                {c.steps
                  .filter((s) => s.status !== "dropped")
                  .map((s) => {
                    const w = waiting.indexOf(s);
                    return (
                      <li key={s.id} data-status={s.status}>
                        <span className={styles.stepDot} aria-hidden="true" />
                        <span className={styles.stepText}>{s.prompt.split("\n")[0]}</span>
                        <span className={styles.meta}>{STEP_WORD[s.status]}</span>
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
                  className={styles.row}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = adding[c.id]?.trim();
                    if (text) act(client.addChainStep(c.id, text).then(() => setAdding((a) => ({ ...a, [c.id]: "" }))));
                  }}
                >
                  <input className="input" aria-label={`add a step to ${c.name}`} placeholder="Then another agent…" value={adding[c.id] ?? ""} onChange={(e) => setAdding((a) => ({ ...a, [c.id]: e.target.value }))} />
                  <button className="btn btnSm" type="submit" disabled={!adding[c.id]?.trim()}>
                    Add a step
                  </button>
                  {(c.status === "running" || c.status === "needs-you") && (
                    <button type="button" className="btn btnSm btnGhost" onClick={() => act(client.stopChain(c.id))}>
                      Stop the chain
                    </button>
                  )}
                </form>
              )}
            </article>
          );
        })}
    </section>
  );
}
