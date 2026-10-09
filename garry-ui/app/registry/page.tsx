"use client";
import { useEffect, useState } from "react";
import styles from "../panel.module.css";
import { apiBase } from "../lib/api";

interface Service {
  name: string;
  stack?: string;
  owner?: string;
  exposes: string[];
  consumes: Record<string, string[]>;
}

interface RegistryData {
  services: Service[];
  contracts: {
    remotes?: Record<string, unknown>;
    sharedDeps?: Record<string, unknown>;
    events?: Record<string, unknown>;
  };
}

export default function Registry() {
  const [data, setData] = useState<RegistryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/registry`)
      .then((r) => r.json())
      .then((d: RegistryData) => setData(d))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  if (error) return <main className={styles.main}><p className={styles.muted}>Cannot reach garry-server. Run garry serve.</p></main>;
  if (!data) return <main className={styles.main}><p>Loading...</p></main>;

  return (
    <main className={styles.main}>
      <h1>Registry</h1>
      <h2>Services</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>name</th>
            <th>stack</th>
            <th>owner</th>
            <th>exposes</th>
            <th>consumes</th>
          </tr>
        </thead>
        <tbody>
          {data.services.map((s) => (
            <tr key={s.name}>
              <td>{s.name}</td>
              <td className={styles.muted}>{s.stack}</td>
              <td className={styles.muted}>{s.owner}</td>
              <td>{s.exposes.join(", ")}</td>
              <td className={styles.muted}>{Object.keys(s.consumes).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Contracts</h2>
      <p className={styles.muted}>
        remotes: {Object.keys(data.contracts.remotes ?? {}).length}, shared deps:{" "}
        {Object.keys(data.contracts.sharedDeps ?? {}).length}, events:{" "}
        {Object.keys(data.contracts.events ?? {}).length}
      </p>
    </main>
  );
}
