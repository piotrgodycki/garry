"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import Waveform from "./Waveform";
import { apiBase } from "./lib/api";

interface Feature {
  id: string;
  title: string;
  status: string;
  services: string[];
}
interface Idea {
  key: number;
  text: string;
}

// The SDLC Garry drives autonomously end to end. The dashboard only reports it.
const STAGES = ["spec", "plan", "design", "implement", "review", "test", "integrate", "done"];

export default function Dashboard() {
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idea, setIdea] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [seq, setSeq] = useState(1);

  useEffect(() => {
    fetch(`${apiBase}/api/features`)
      .then((r) => r.json())
      .then((d) => setFeatures(d.features as Feature[]))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  // Capture an idea. It does NOT become a feature yet. It sits in Ideas until the
  // human and Garry talk it through, and only then is a feature created.
  const captureIdea = (e: React.FormEvent) => {
    e.preventDefault();
    const text = idea.trim();
    if (!text) return;
    setIdeas((prev) => [{ key: seq, text }, ...prev]);
    setSeq((n) => n + 1);
    setIdea("");
  };

  const discuss = (text: string) => {
    window.dispatchEvent(new CustomEvent("garry:idea", { detail: text }));
  };

  const stageIndex = (status: string) => {
    const i = STAGES.indexOf(status);
    return i < 0 ? 0 : i;
  };

  const running = (features ?? []).filter((f) => f.status !== "done");
  const shipped = (features ?? []).filter((f) => f.status === "done");

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <div>
          <h1>Garry</h1>
          <p className={styles.sub}>drop an idea, talk it through, then Garry builds, ships and fixes it. you watch.</p>
        </div>
        <Waveform bars={28} />
      </div>

      {/* Idea intake: the only thing the human drives. No feature picker, no run. */}
      <form className={styles.intake} onSubmit={captureIdea}>
        <span className={styles.intakeIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 6.3L21 9l-5 4.2L17.6 20 12 16.3 6.4 20 8 13.2 3 9l6.6-.7z" /></svg>
        </span>
        <input
          className={styles.intakeInput}
          placeholder="an idea, a feature, a rough thought, drop it here"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          aria-label="new idea"
        />
        <button className={styles.intakeBtn} type="submit" disabled={!idea.trim()}>
          capture idea
        </button>
      </form>

      {error && <p className={styles.error}>Cannot reach garry-server. Start it with <code>pnpm serve</code>.</p>}
      {!features && !error && <p>Loading...</p>}

      <div className={styles.lanes}>
        {/* Ideas: raw, not yet features. They become features only after a chat with Garry. */}
        <section className={styles.lane}>
          <div className={styles.laneHead}>
            <span className={styles.laneName}>Ideas</span>
            <span className={styles.laneCount}>{ideas.length}</span>
          </div>
          <p className={styles.laneHint}>talk each one through with Garry, then it becomes a feature</p>
          {ideas.length === 0 ? (
            <p className={styles.quiet}>no ideas yet. drop one above.</p>
          ) : (
            <div className={styles.report}>
              {ideas.map((it) => (
                <div key={it.key} className={styles.ideaCard}>
                  <div className={styles.ideaText}>{it.text}</div>
                  <div className={styles.ideaFoot}>
                    <span className={styles.ideaStatus}>needs a chat</span>
                    <button className={styles.ideaBtn} onClick={() => discuss(it.text)}>talk to Garry</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Agents at work: autonomous. Read only report, no controls. */}
        <section className={styles.lane}>
          <div className={styles.laneHead}>
            <span className={styles.laneName}>Agents at work</span>
            <span className={styles.laneCount}>{running.length}</span>
          </div>
          <p className={styles.laneHint}>building, reviewing, testing, shipping on their own</p>
          {features && running.length === 0 ? (
            <p className={styles.quiet}>nothing in flight</p>
          ) : (
            <div className={styles.report}>
              {running.map((f) => {
                const idx = stageIndex(f.status);
                return (
                  <Link key={f.id} href={`/agent?feature=${f.id}`} className={styles.row}>
                    <div className={styles.rowTop}>
                      <span className={styles.id}>{f.id}</span>
                      <span className={styles.stageNow}>{f.status}</span>
                    </div>
                    <div className={styles.title}>{f.title}</div>
                    <div className={styles.svcs}>
                      {f.services.map((s) => <span key={s} className="chip">{s}</span>)}
                    </div>
                    <div className={styles.track} aria-label={`stage ${f.status}`}>
                      {STAGES.slice(0, STAGES.length - 1).map((s, i) => (
                        <span
                          key={s}
                          className={`${styles.step} ${i < idx ? styles.stepDone : ""} ${i === idx ? styles.stepLive : ""}`}
                          title={s}
                        />
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Shipped: done and deployed by the agents. */}
        <section className={styles.lane}>
          <div className={styles.laneHead}>
            <span className={styles.laneName}>Shipped</span>
            <span className={styles.laneCount}>{shipped.length}</span>
          </div>
          <p className={styles.laneHint}>merged, tagged and deployed</p>
          {features && shipped.length === 0 ? (
            <p className={styles.quiet}>nothing shipped yet</p>
          ) : (
            <div className={styles.report}>
              {shipped.map((f) => (
                <Link key={f.id} href={`/agent?feature=${f.id}`} className={`${styles.row} ${styles.rowDone}`}>
                  <div className={styles.rowTop}>
                    <span className={styles.id}>{f.id}</span>
                    <span className={styles.stageShipped}>shipped</span>
                  </div>
                  <div className={styles.title}>{f.title}</div>
                  <div className={styles.svcs}>
                    {f.services.map((s) => <span key={s} className="chip">{s}</span>)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
