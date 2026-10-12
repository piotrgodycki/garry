"use client";
import { use, useEffect, useRef, useState } from "react";
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
interface LogEntry {
  index: number;
  stage: string;
  who: string;
  agent: string;
  model: string;
  skill: string;
  action: string;
}
interface Model {
  id: string;
  label: string;
}

export default function ServicePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const [svc, setSvc] = useState<Service | null>(null);
  const [missing, setMissing] = useState(false);
  const [featureId, setFeatureId] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [models, setModels] = useState<Record<string, string>>({});
  const [streaming, setStreaming] = useState(false);
  const [finished, setFinished] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/registry`)
      .then((r) => r.json())
      .then((d) => {
        const found = (d.services as Service[]).find((s) => s.name === name);
        if (found) setSvc(found);
        else setMissing(true);
      })
      .catch(() => setMissing(true));
    fetch(`${apiBase}/api/models`)
      .then((r) => r.json())
      .then((d) => setModels(Object.fromEntries(((d.models as Model[]) ?? []).map((m) => [m.id, m.label]))))
      .catch(() => undefined);
  }, [name]);

  // Find the feature this service belongs to: the one named in the URL, else the
  // first feature that lists this service.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("feature");
    fetch(`${apiBase}/api/features`)
      .then((r) => r.json())
      .then((d) => {
        const fs = (d.features as { id: string; services?: string[] }[]) ?? [];
        const pick = (wanted && fs.find((f) => f.id === wanted)) || fs.find((f) => f.services?.includes(name)) || null;
        setFeatureId(pick?.id ?? null);
      })
      .catch(() => undefined);
  }, [name]);

  // Live detailed work log: every skill step the agent runs on THIS service.
  useEffect(() => {
    if (!featureId) return;
    setLog([]);
    setFinished(false);
    setStreaming(true);
    const es = new EventSource(`${apiBase}/api/features/${featureId}/stream`);
    es.addEventListener("log", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as LogEntry;
      if (d.who !== name) return;
      setLog((prev) => [...prev, d]);
    });
    es.addEventListener("done", () => {
      setFinished(true);
      setStreaming(false);
      es.close();
    });
    es.onerror = () => {
      setStreaming(false);
      es.close();
    };
    return () => es.close();
  }, [featureId, name]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  if (missing) return <main className={styles.main}><p><Link href="/agent">back</Link></p><p className={styles.muted}>Service {name} not found.</p></main>;
  if (!svc) return <main className={styles.main}><p className={styles.muted}>Loading...</p></main>;

  return (
    <main className={styles.main}>
      <p><Link href={featureId ? `/agent?feature=${featureId}` : "/agent"}>back to agent</Link></p>
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

      {/* Detailed work log: exactly what the agent did on this service, step by step. */}
      <div className={`card ${styles.logCard}`}>
        <div className={styles.logHead}>
          <div className={styles.logTitle}>
            <span className={`${styles.liveDot} ${streaming ? styles.liveOn : ""}`} />
            Work log
          </div>
          <span className={styles.logState}>
            {streaming ? "live" : finished ? "complete" : featureId ? "idle" : "no feature"}
            <span className={styles.logCount}>{log.length} steps</span>
          </span>
        </div>
        <div className={styles.logBody} ref={logRef}>
          {log.length === 0 ? (
            <p className={styles.logEmpty}>
              {featureId ? "waiting for the agent to touch this service" : "no feature references this service yet"}
            </p>
          ) : (
            <ol className={styles.logList}>
              {log.map((l, i) => {
                const live = streaming && i === log.length - 1;
                return (
                  <li key={`${l.index}-${l.skill}-${i}`} className={`${styles.logRow} ${live ? styles.logRowLive : ""}`}>
                    <span className={`dot ${live ? "run" : "ok"}`} />
                    <span className={styles.logStage}>{l.stage}</span>
                    <span className={styles.logText}>
                      <span className={styles.logAction}>{l.action}</span>
                      <span className={styles.logSkill}>{l.skill}</span>
                    </span>
                    <span className={styles.logMeta}>{l.agent} · {models[l.model] ?? l.model}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </main>
  );
}
