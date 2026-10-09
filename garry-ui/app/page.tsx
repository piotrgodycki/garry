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
          Cannot reach garry-server at {apiBase}. Start it with <code>garry serve</code>.
        </p>
      )}
      {!features && !error && <p>Loading...</p>}
      <ul className={styles.list}>
        {features?.map((f) => (
          <li key={f.id} className={styles.card}>
            <span className={styles.status}>{f.status}</span>
            <Link href={`/pipeline/${f.id}`}>
              <strong>{f.id}</strong> {f.title}
            </Link>
            <div className={styles.svc}>{f.services.join(", ")}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
