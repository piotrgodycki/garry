"use client";
import { useEffect, useState } from "react";
import styles from "./lessons.module.css";
import { api } from "../lib/api";
import { Icon } from "../icons";
import { Empty, PageHeader, ServerNotice, Skeleton } from "../ui";

interface Incident {
  feature: string;
  stage: string;
  service?: string;
  date: string;
  source: string;
  summary: string;
}

interface Lesson {
  id: string;
  title: string;
  kind: "mistake" | "practice";
  status: "active" | "retired";
  rule: string;
  appliesTo: { stages: string[]; services: string[]; skills: string[] };
  incidents: Incident[];
  recurring: boolean;
}

function Scope({ label, items, all }: { label: string; items: string[]; all: string }) {
  return (
    <div className={styles.scopeRow}>
      <span className={styles.scopeLabel}>{label}</span>
      <span className={styles.chips}>
        {items.length ? items.map((s) => <span key={s} className="chip mono">{s}</span>) : <span className={styles.all}>{all}</span>}
      </span>
    </div>
  );
}

export default function Lessons() {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api(`/api/lessons`)
      .then((r) => r.json())
      .then((d) => setLessons(d.lessons as Lesson[]))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const active = (lessons ?? []).filter((l) => l.status === "active");
  const retired = (lessons ?? []).filter((l) => l.status === "retired");
  const recurring = active.filter((l) => l.recurring);
  const incidents = (lessons ?? []).reduce((n, l) => n + l.incidents.length, 0);

  return (
    <main className="page">
      <PageHeader
        eyebrow="Overview"
        title="Lessons"
        lede="What Garry learned in this project, mostly from its own mistakes. Each rule is injected into every matching task and into .garry/lessons.md, so the same mistake is not made twice."
      />

      {error && <ServerNotice />}
      {!lessons && !error && <Skeleton rows={2} height={140} />}

      {lessons && (
        <div className={styles.stats}>
          <div className="card stat"><span className="statLabel">Active lessons</span><span className="statValue">{active.length}</span></div>
          <div className="card stat"><span className="statLabel">Mistakes recorded</span><span className="statValue">{incidents}</span></div>
          <div className="card stat"><span className="statLabel"><span className="dot run" /> Recurring</span><span className="statValue">{recurring.length}</span></div>
        </div>
      )}

      {lessons && lessons.length === 0 && (
        <div className="card">
          <Empty icon={Icon.lesson}>No lessons yet. Garry records one after every review finding, failed test or correction.</Empty>
        </div>
      )}

      {active.length > 0 && (
        <section className="section">
          <div className="sectionHead">
            <h2>Active</h2>
            <span className="count">{active.length}</span>
          </div>
          <div className={styles.list}>
            {active.map((l) => (
              <article key={l.id} className={`card ${styles.lesson} ${l.recurring ? styles.recurring : ""}`}>
                <header className={styles.head}>
                  <span className={styles.id}>{l.id}</span>
                  <h3 className={styles.title}>{l.title}</h3>
                  <span className={styles.badges}>
                    <span className={`badge ${l.kind === "mistake" ? "danger" : "ok"}`}>{l.kind}</span>
                    {l.recurring && <span className="badge run">recurring</span>}
                  </span>
                </header>
                <p className={styles.rule}>{l.rule}</p>
                <div className={styles.scope}>
                  <Scope label="Stages" items={l.appliesTo.stages} all="every stage" />
                  <Scope label="Services" items={l.appliesTo.services} all="whole project" />
                  <Scope label="Skills" items={l.appliesTo.skills} all="any skill" />
                </div>
                <details className={styles.incidents}>
                  <summary>
                    {l.incidents.length} {l.incidents.length === 1 ? "incident" : "incidents"}
                    {l.recurring && <span className={styles.promote}>candidate for @garry/skills</span>}
                  </summary>
                  <ol>
                    {l.incidents.map((i, n) => (
                      <li key={n}>
                        <span className={styles.meta}>
                          {i.date} · {i.feature} · {i.stage}
                          {i.service ? ` · ${i.service}` : ""} · {i.source}
                        </span>
                        <span>{i.summary}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              </article>
            ))}
          </div>
        </section>
      )}

      {retired.length > 0 && (
        <section className="section">
          <div className="sectionHead">
            <h2>Retired</h2>
            <span className="count">{retired.length}</span>
          </div>
          <div className={styles.list}>
            {retired.map((l) => (
              <div key={l.id} className={`card ${styles.lesson} ${styles.retired}`}>
                <header className={styles.head}>
                  <span className={styles.id}>{l.id}</span>
                  <h3 className={styles.title}>{l.title}</h3>
                </header>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
