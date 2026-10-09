"use client";
import { useEffect, useState } from "react";
import styles from "../panel.module.css";
import { apiBase } from "../lib/api";

interface Route {
  agent: string;
  model: string;
}

interface RoutingData {
  defaults?: Route | null;
  stages?: Record<string, Route>;
}

export default function Routing() {
  const [data, setData] = useState<RoutingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/routing`)
      .then((r) => r.json())
      .then((d: RoutingData) => setData(d))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  if (error) return <main className={styles.main}><p className={styles.muted}>Cannot reach garry-server. Run garry serve.</p></main>;
  if (!data) return <main className={styles.main}><p>Loading...</p></main>;

  const stages = Object.entries(data.stages ?? {});

  return (
    <main className={styles.main}>
      <h1>Routing</h1>
      <p className={styles.muted}>
        default: {data.defaults ? `${data.defaults.agent}:${data.defaults.model}` : "(none)"}
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>stage</th>
            <th>agent</th>
            <th>model</th>
          </tr>
        </thead>
        <tbody>
          {stages.map(([stage, r]) => (
            <tr key={stage}>
              <td>{stage}</td>
              <td>{r.agent}</td>
              <td className={styles.muted}>{r.model}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
