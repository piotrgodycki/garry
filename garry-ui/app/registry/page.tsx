"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../panel.module.css";
import { apiBase } from "../lib/api";
import { Icon } from "../icons";
import { PageHeader, ServerNotice, Skeleton } from "../ui";

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

  const contracts = data
    ? [
        { label: "Remotes", value: Object.keys(data.contracts.remotes ?? {}).length },
        { label: "Shared dependencies", value: Object.keys(data.contracts.sharedDeps ?? {}).length },
        { label: "Events", value: Object.keys(data.contracts.events ?? {}).length },
      ]
    : [];

  return (
    <main className="page">
      <PageHeader
        eyebrow="Configure"
        title="Contract registry"
        lede="Every service, what it exposes and what it consumes. Agents read this before they touch a repository, so no change can break a contract."
      />

      {error && <ServerNotice />}
      {!data && !error && <Skeleton rows={2} height={140} />}

      {data && (
        <>
          <div className="stats">
            <div className="card stat">
              <span className="statLabel">Services</span>
              <span className="statValue">{data.services.length}</span>
            </div>
            {contracts.map((c) => (
              <div key={c.label} className="card stat">
                <span className="statLabel">{c.label}</span>
                <span className="statValue">{c.value}</span>
              </div>
            ))}
          </div>

          <section className="section">
            <div className="sectionHead">
              <h2>Services</h2>
              <span className="count">{data.services.length} registered</span>
            </div>
            <div className={styles.grid}>
              {data.services.map((s) => {
                const deps = Object.keys(s.consumes);
                return (
                  <Link key={s.name} href={`/service/${s.name}`} className={`card cardLink ${styles.svcCard}`}>
                    <div className={styles.svcHead}>
                      <span className={styles.svcIcon}>{Icon.service}</span>
                      <div className={styles.svcTitle}>
                        <span className={styles.svcName}>{s.name}</span>
                        {s.owner && <span className={styles.svcMeta}>{s.owner}</span>}
                      </div>
                      <span className={styles.chevron}>{Icon.chevron}</span>
                    </div>
                    {s.stack && <div className={styles.stack}>{s.stack}</div>}
                    <dl className={styles.facts}>
                      <dt>Exposes</dt>
                      <dd>
                        {s.exposes.length ? s.exposes.map((e) => <span key={e} className="chip mono">{e}</span>) : <span className="muted">nothing</span>}
                      </dd>
                      <dt>Consumes</dt>
                      <dd>
                        {deps.length ? deps.map((d) => <span key={d} className="chip">{d}</span>) : <span className="muted">nothing</span>}
                      </dd>
                    </dl>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
