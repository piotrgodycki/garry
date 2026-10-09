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

function checkDot(checks: string): string {
  if (checks === "passing") return "ok";
  if (checks === "failing") return "run";
  return "wait";
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
      <h1 className={styles.title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/github.svg" alt="" width={22} height={22} />
        Pull requests
      </h1>
      <div className={styles.picker}>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="feature">
          {features.map((f) => (
            <option key={f.id} value={f.id}>
              {f.id} {f.title}
            </option>
          ))}
        </select>
      </div>

      <table className={`card ${styles.table}`}>
        <thead>
          <tr>
            <th></th>
            <th>service</th>
            <th>branch</th>
            <th>state</th>
            <th>checks</th>
            <th>repo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {prs?.map((pr) => (
            <tr key={pr.service}>
              <td>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/github.svg" alt="" width={16} height={16} />
              </td>
              <td className={styles.svc}>{pr.service}</td>
              <td className={styles.branch}>{pr.branch}</td>
              <td>
                <span className={`${styles.badge} ${styles.draft}`}>{pr.state}</span>
              </td>
              <td>
                <span className={`dot ${checkDot(pr.checks)}`} />
                {pr.checks}
              </td>
              <td className={styles.repo}>{pr.repo}</td>
              <td>
                {pr.url ? (
                  <a href={pr.url} target="_blank" rel="noreferrer">open</a>
                ) : (
                  <span className={styles.muted}>n/a</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className={styles.note}>
        One pull request per service on branch <code>feat/{selected}</code>. Live GitHub status
        (open or merged, real check results) is wired in phase 6 with the narrow token.
      </p>
    </main>
  );
}
