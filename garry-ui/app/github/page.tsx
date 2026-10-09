"use client";
import { useEffect, useState } from "react";
import styles from "../panel.module.css";
import { apiBase } from "../lib/api";

interface Service {
  name: string;
  repo?: string;
}

export default function GitHub() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/registry`)
      .then((r) => r.json())
      .then((d) => setServices(d.services as Service[]))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  if (error) return <main className={styles.main}><p className={styles.muted}>Cannot reach garry-server. Run garry serve.</p></main>;
  if (!services) return <main className={styles.main}><p>Loading...</p></main>;

  return (
    <main className={styles.main}>
      <h1>GitHub</h1>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>service</th>
            <th>repo</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.name}>
              <td>{s.name}</td>
              <td className={styles.muted}>{s.repo}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.note}>
        Opening pull requests and reading status checks is wired in phase 6 (narrow GitHub token).
      </p>
    </main>
  );
}
