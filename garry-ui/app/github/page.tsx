"use client";
import { useEffect, useState } from "react";
import styles from "./prs.module.css";
import { apiBase } from "../lib/api";

interface Feature {
  id: string;
  title: string;
}
interface Pr {
  service: string;
  branch: string;
  repo: string;
  url: string;
  state: string;
  checks: string;
  live: boolean;
}

export default function Prs() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [prs, setPrs] = useState<Pr[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/features`)
      .then((r) => r.json())
      .then((d) => {
        const fs = (d.features as Feature[]) ?? [];
        setFeatures(fs);
        if (fs[0]) setSelected(fs[0].id);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(`${apiBase}/api/features/${selected}/prs`)
      .then((r) => r.json())
      .then((d) => setPrs(d.prs as Pr[]))
      .catch((e: unknown) => setError(String(e)));
  }, [selected]);

  if (error) return <main className={styles.main}><p className={styles.muted}>Cannot reach garry-server. Run pnpm serve.</p></main>;

  return (
    <main className={styles.main}>
      <h1>Pull requests</h1>
      <div className={styles.picker}>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="feature">
          {features.map((f) => (
            <option key={f.id} value={f.id}>
              {f.id} {f.title}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.board}>
        {prs?.map((pr) => (
          <div key={pr.service} className={`card ${styles.pr}`}>
            <div className={styles.prTop}>
              <span className={styles.svc}>{pr.service}</span>
              <span className={`${styles.badge} ${styles.draft}`}>{pr.state}</span>
            </div>
            <span className={styles.branch}>{pr.branch}</span>
            <span className={styles.repo}>{pr.repo}</span>
            <div className={styles.state}>
              <span className="dot wait" />
              <span className={styles.checks}>checks: {pr.checks}</span>
            </div>
          </div>
        ))}
      </div>

      <p className={styles.note}>
        These are the pull requests Garry will open for this feature, one per service on branch{" "}
        <code>feat/{selected}</code>. Live GitHub status (open or merged, real check results) is wired
        in phase 6 with the narrow token.
      </p>
    </main>
  );
}
