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

const COLUMNS = ["spec", "plan", "design", "implement", "review", "test", "integrate", "done"];

export default function Dashboard() {
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/features`)
      .then((r) => r.json())
      .then((d) => setFeatures(d.features as Feature[]))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const drop = (status: string) => {
    setOver(null);
    if (!dragId) return;
    const id = dragId;
    setDragId(null);
    setFeatures((prev) => prev?.map((f) => (f.id === id ? { ...f, status } : f)) ?? prev);
    fetch(`${apiBase}/api/features/${id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => undefined);
  };

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <div>
          <h1>Features</h1>
          <p className={styles.sub}>drag a feature across the pipeline</p>
        </div>
        <Waveform bars={28} />
      </div>

      {error && <p className={styles.error}>Cannot reach garry-server. Start it with <code>pnpm serve</code>.</p>}
      {!features && !error && <p>Loading...</p>}

      {features && (
        <div className={styles.board}>
          {COLUMNS.map((col) => {
            const items = features.filter((f) => f.status === col);
            return (
              <div
                key={col}
                className={`${styles.column} ${over === col ? styles.columnOver : ""}`}
                onDragOver={(e) => { e.preventDefault(); setOver(col); }}
                onDragLeave={() => setOver((o) => (o === col ? null : o))}
                onDrop={() => drop(col)}
              >
                <div className={styles.colHead}>
                  <span className={styles.colName}>{col}</span>
                  <span className={styles.colCount}>{items.length}</span>
                </div>
                <div className={styles.cards}>
                  {items.map((f) => (
                    <div
                      key={f.id}
                      className={`${styles.card} ${dragId === f.id ? styles.dragging : ""}`}
                      draggable
                      onDragStart={() => setDragId(f.id)}
                      onDragEnd={() => setDragId(null)}
                    >
                      <div className={styles.cardTop}>
                        <span className={styles.id}>{f.id}</span>
                      </div>
                      <div className={styles.title}>{f.title}</div>
                      <div className={styles.svcs}>
                        {f.services.map((s) => <span key={s} className="chip">{s}</span>)}
                      </div>
                      <div className={styles.actions}>
                        <Link className={styles.primary} href={`/agent?feature=${f.id}`}>hand to agent</Link>
                        <Link className={styles.ghost} href={`/pipeline/${f.id}`}>pipeline</Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
