"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "../panel.module.css";
import { tierOf } from "../ModelChip";
import { apiBase } from "../lib/api";

const TIER_COLOR: Record<string, string> = {
  opus: "#7c3aed",
  sonnet: "#0ea5e9",
  haiku: "#16a34a",
  fable: "#db2777",
};

interface Route {
  agent: string;
  model: string;
}
interface RoutingData {
  defaults?: Route | null;
  stages?: Record<string, Route>;
}
interface Model {
  id: string;
  label: string;
}

export default function Routing() {
  const [data, setData] = useState<RoutingData | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch(`${apiBase}/api/routing`).then((r) => r.json()),
      fetch(`${apiBase}/api/models`).then((r) => r.json()),
    ])
      .then(([r, m]) => {
        setData(r as RoutingData);
        setModels((m.models as Model[]) ?? []);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);
  useEffect(() => load(), [load]);

  const change = (stage: string, model: string) => {
    fetch(`${apiBase}/api/routing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage, model }),
    })
      .then((r) => r.json())
      .then((r: RoutingData) => setData(r))
      .catch(() => undefined);
  };

  if (error) return <main className={styles.main}><p className={styles.muted}>Cannot reach garry-server. Run pnpm serve.</p></main>;
  if (!data) return <main className={styles.main}><p>Loading...</p></main>;

  const stages = Object.entries(data.stages ?? {});

  return (
    <main className={styles.main}>
      <h1>Routing</h1>
      <p className={styles.muted}>
        default: {data.defaults ? `${data.defaults.agent} · ${data.defaults.model}` : "(none)"}
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
              <td>
                <label className={styles.modelCell}>
                  <span className={styles.tierDot} style={{ background: TIER_COLOR[tierOf(r.model)] }} />
                  <select
                    className={styles.modelSelect}
                    value={r.model}
                    onChange={(e) => change(stage, e.target.value)}
                    aria-label={`model for ${stage}`}
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.note}>Changing a model updates garry.routing.json and applies to the next run. The agent role stays.</p>
    </main>
  );
}
