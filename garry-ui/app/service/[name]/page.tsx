"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./service.module.css";
import { apiBase } from "../../lib/api";

interface Service {
  name: string;
  repo?: string;
  stack?: string;
  kind?: string;
  owner?: string;
  exposes: string[];
  consumes: Record<string, string[]>;
  db?: { engine: string; name?: string } | null;
  api?: { kind: string; path: string; version?: string };
}

export default function ServicePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const [svc, setSvc] = useState<Service | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/registry`)
      .then((r) => r.json())
      .then((d) => {
        const found = (d.services as Service[]).find((s) => s.name === name);
        if (found) setSvc(found);
        else setMissing(true);
      })
      .catch(() => setMissing(true));
  }, [name]);

  if (missing) return <main className={styles.main}><p><Link href="/agent">back</Link></p><p className={styles.muted}>Service {name} not found.</p></main>;
  if (!svc) return <main className={styles.main}><p className={styles.muted}>Loading...</p></main>;

  return (
    <main className={styles.main}>
      <p><Link href="/agent">back to agent</Link></p>
      <div className={styles.head}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.icon} src="/service.svg" alt="" />
        <div>
          <h1>{svc.name}</h1>
          <span className={styles.sub}>{svc.stack}</span>
        </div>
        {svc.kind && <span className="chip">{svc.kind}</span>}
      </div>

      <div className={styles.grid}>
        <div className={`card ${styles.block}`}>
          <h2>Overview</h2>
          <dl className={styles.dl}>
            <dt>owner</dt><dd>{svc.owner}</dd>
            <dt>repo</dt><dd className={styles.mono}>{svc.repo}</dd>
            {svc.db && <><dt>database</dt><dd>{svc.db.engine}{svc.db.name ? ` (${svc.db.name})` : ""}</dd></>}
            {svc.api && <><dt>api</dt><dd>{svc.api.kind} {svc.api.version ?? ""}</dd></>}
          </dl>
        </div>

        <div className={`card ${styles.block}`}>
          <h2>Exposes</h2>
          {svc.exposes.length ? (
            <ul className={styles.list}>{svc.exposes.map((e) => <li key={e} className={styles.mono}>{e}</li>)}</ul>
          ) : <p className={styles.muted}>nothing</p>}
        </div>

        <div className={`card ${styles.block}`}>
          <h2>Communicates with</h2>
          {Object.keys(svc.consumes).length ? (
            <ul className={styles.list}>
              {Object.entries(svc.consumes).map(([dep, mods]) => (
                <li key={dep}>
                  <Link href={`/service/${dep}`}>{dep}</Link>
                  <span className={styles.mono}> {mods.join(", ")}</span>
                </li>
              ))}
            </ul>
          ) : <p className={styles.muted}>nothing</p>}
        </div>
      </div>
    </main>
  );
}
