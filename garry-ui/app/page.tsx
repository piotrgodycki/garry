"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { apiBase } from "./lib/api";

interface Feature {
  id: string;
  title: string;
  status: string;
  services: string[];
}

export default function Dashboard() {
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/features`)
      .then((r) => r.json())
      .then((d) => setFeatures(d.features as Feature[]))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  return (
    <main className={styles.main}>
      <h1>Features</h1>
      {error && (
        <p className={styles.error}>
          Cannot reach garry-server at {apiBase}. Start it with <code>pnpm serve</code>.
        </p>
      )}
      {!features && !error && <p>Loading...</p>}
      <ul className={styles.list}>
        {features?.map((f) => (
          <li key={f.id} className={`card ${styles.card}`}>
            <div className={styles.row}>
              <span className={styles.status}>{f.status}</span>
              <span className={styles.id}>{f.id}</span>
              <span className={styles.title}>{f.title}</span>
            </div>
            <div className={styles.svcs}>
              {f.services.map((s) => (
                <span key={s} className="chip">{s}</span>
              ))}
            </div>
            <div className={styles.actions}>
              <Link className={styles.primary} href={`/agent?feature=${f.id}`}>hand to agent</Link>
              <Link className={styles.ghost} href={`/pipeline/${f.id}`}>pipeline</Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
