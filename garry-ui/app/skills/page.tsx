"use client";
import { useEffect, useMemo, useState } from "react";
import styles from "../panel.module.css";
import { api } from "../lib/api";
import { Icon } from "../icons";
import { Empty, PageHeader, ServerNotice, Skeleton } from "../ui";

interface Skill {
  name: string;
  stage: string;
  summary: string;
}

export default function Skills() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api(`/api/skills`)
      .then((r) => r.json())
      .then((d) => setSkills(d.skills as Skill[]))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (skills ?? []).filter((s) => !q || s.name.includes(q) || s.summary.toLowerCase().includes(q) || s.stage.includes(q));
  }, [skills, query]);
  const stages = [...new Set(filtered.map((s) => s.stage))];

  return (
    <main className="page">
      <PageHeader
        eyebrow="Configure"
        title="Skills"
        lede="Atomic capabilities the agents can use, grouped by the SDLC stage they belong to. One skill, one responsibility."
        actions={
          skills && (
            <label className="searchField" style={{ minWidth: 260 }}>
              {Icon.search}
              <input className="input" placeholder="Search skills" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="search skills" />
            </label>
          )
        }
      />

      {error && <ServerNotice />}
      {!skills && !error && <Skeleton rows={3} height={90} />}
      {skills && filtered.length === 0 && (
        <div className="card">
          <Empty icon={Icon.search}>No skill matches "{query}".</Empty>
        </div>
      )}

      {stages.map((stage) => {
        const items = filtered.filter((s) => s.stage === stage);
        return (
          <section key={stage} className="section">
            <div className="sectionHead">
              <h2 className={styles.stageTitle}>{stage}</h2>
              <span className="count">{items.length} {items.length === 1 ? "skill" : "skills"}</span>
            </div>
            <div className={styles.grid}>
              {items.map((s) => (
                <div key={s.name} className={`card ${styles.skill}`}>
                  <div className={styles.skillHead}>
                    <span className={styles.skillIcon}>{Icon.bolt}</span>
                    <span className={styles.skillName}>{s.name}</span>
                  </div>
                  <p className={styles.skillSummary}>{s.summary}</p>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
