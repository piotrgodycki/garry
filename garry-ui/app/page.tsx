"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { apiBase } from "./lib/api";
import { Icon } from "./icons";
import { Empty, PageHeader, ServerNotice, Skeleton } from "./ui";

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
  const services = new Set((features ?? []).flatMap((f) => f.services));
  const loading = !features && !error;

  const STATS = [
    { label: "Ideas waiting", value: ideas.length, dot: "wait" },
    { label: "Agents at work", value: running.length, dot: running.length ? "run" : "wait" },
    { label: "Shipped", value: shipped.length, dot: "ok" },
    { label: "Services involved", value: services.size, dot: "" },
  ];

  return (
    <main className="page">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        lede="Drop an idea and talk it through with Garry. The agents build, review, test and ship it on their own. You watch."
        actions={
          <Link className="btn" href="/agent">
            {Icon.agent}
            Open live agents
          </Link>
        }
      />

      {/* Idea intake: the only thing the human drives. No feature picker, no run. */}
      <form className={`card ${styles.intake}`} onSubmit={captureIdea}>
        <span className={styles.intakeIcon} aria-hidden="true">{Icon.idea}</span>
        <input
          className={styles.intakeInput}
          placeholder="An idea, a feature, a rough thought. Drop it here."
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          aria-label="new idea"
        />
        <span className={styles.intakeHint}>
          <kbd className="kbd">Enter</kbd>
        </span>
        <button className="btn btnPrimary" type="submit" disabled={!idea.trim()}>
          Capture idea
        </button>
      </form>

      {error && <ServerNotice />}

      <div className="stats">
        {STATS.map((s) => (
          <div key={s.label} className="card stat">
            <span className="statLabel">
              {s.dot && <span className={`dot ${s.dot}`} />}
              {s.label}
            </span>
            <span className="statValue">{loading ? "..." : s.value}</span>
          </div>
        ))}
      </div>

      <div className={styles.lanes}>
        {/* Ideas: raw, not yet features. They become features only after a chat with Garry. */}
        <section className={styles.lane} aria-label="ideas">
          <div className={styles.laneHead}>
            <span className={styles.laneName}><span className="dot wait" />Ideas</span>
            <span className={styles.laneCount}>{ideas.length}</span>
          </div>
          <p className={styles.laneHint}>Talk each one through with Garry. Then it becomes a feature.</p>
          {ideas.length === 0 ? (
            <div className={styles.laneEmpty}>
              <Empty icon={Icon.idea}>No ideas yet. Capture one above.</Empty>
            </div>
          ) : (
            ideas.map((it) => (
              <div key={it.key} className={`card ${styles.ideaCard}`}>
                <div className={styles.ideaText}>{it.text}</div>
                <div className={styles.cardFoot}>
                  <span className="badge warn">Needs a chat</span>
                  <button className="btn btnSm" onClick={() => discuss(it.text)}>
                    {Icon.mic}
                    Talk it through
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        {/* Agents at work: autonomous. Read only report, no controls. */}
        <section className={styles.lane} aria-label="agents at work">
          <div className={styles.laneHead}>
            <span className={styles.laneName}><span className={`dot ${running.length ? "run" : "wait"}`} />Agents at work</span>
            <span className={styles.laneCount}>{running.length}</span>
          </div>
          <p className={styles.laneHint}>Building, reviewing, testing and shipping on their own.</p>
          {loading ? (
            <Skeleton rows={1} height={150} />
          ) : running.length === 0 ? (
            <div className={styles.laneEmpty}>
              <Empty icon={Icon.agent}>Nothing in flight.</Empty>
            </div>
          ) : (
            running.map((f) => {
              const idx = stageIndex(f.status);
              const steps = STAGES.slice(0, STAGES.length - 1);
              return (
                <Link key={f.id} href={`/agent?feature=${f.id}`} className={`card cardLink ${styles.row}`}>
                  <div className={styles.rowTop}>
                    <span className={styles.id}>{f.id}</span>
                    <span className="badge run"><span className="dot run" />{f.status}</span>
                  </div>
                  <div className={styles.title}>{f.title}</div>
                  <div className={styles.svcs}>
                    {f.services.map((s) => <span key={s} className="chip mono">{s}</span>)}
                  </div>
                  <div className={styles.progress}>
                    <div className={styles.track} aria-label={`stage ${idx + 1} of ${steps.length}: ${f.status}`}>
                      {steps.map((s, i) => (
                        <span
                          key={s}
                          className={`${styles.step} ${i < idx ? styles.stepDone : ""} ${i === idx ? styles.stepLive : ""}`}
                          title={s}
                        />
                      ))}
                    </div>
                    <span className={styles.progressLabel}>
                      Stage {idx + 1} of {steps.length}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </section>

        {/* Shipped: done and deployed by the agents. */}
        <section className={styles.lane} aria-label="shipped">
          <div className={styles.laneHead}>
            <span className={styles.laneName}><span className="dot ok" />Shipped</span>
            <span className={styles.laneCount}>{shipped.length}</span>
          </div>
          <p className={styles.laneHint}>Merged, tagged and deployed.</p>
          {loading ? (
            <Skeleton rows={1} height={110} />
          ) : shipped.length === 0 ? (
            <div className={styles.laneEmpty}>
              <Empty icon={Icon.check}>Nothing shipped yet.</Empty>
            </div>
          ) : (
            shipped.map((f) => (
              <Link key={f.id} href={`/agent?feature=${f.id}`} className={`card cardLink ${styles.row}`}>
                <div className={styles.rowTop}>
                  <span className={styles.id}>{f.id}</span>
                  <span className="badge ok">{Icon.check}Shipped</span>
                </div>
                <div className={styles.title}>{f.title}</div>
                <div className={styles.svcs}>
                  {f.services.map((s) => <span key={s} className="chip mono">{s}</span>)}
                </div>
              </Link>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
