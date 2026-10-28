import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import Link from "../../lib/router";
import styles from "./service.module.css";
import { apiBase } from "../../lib/api";
import { Icon } from "../../icons";
import ModelChip from "../../ModelChip";
import { Empty, PageHeader, Skeleton } from "../../ui";
import ContractEvent from "../../ContractEvent";
import { eventsFor, type Contracts } from "../../lib/contracts";

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

export default function ServicePage() {
  const name = useParams().name ?? "";
  const [svc, setSvc] = useState<Service | null>(null);
  const [missing, setMissing] = useState(false);
  const [contracts, setContracts] = useState<Contracts>({});
  const [featureId, setFeatureId] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [models, setModels] = useState<Record<string, string>>({});
  const [kinds, setKinds] = useState<Record<string, string>>({});
  const [streaming, setStreaming] = useState(false);
  const [finished, setFinished] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/registry`)
      .then((r) => r.json())
      .then((d) => {
        const found = (d.services as Service[]).find((s) => s.name === name);
        setContracts((d.contracts as Contracts) ?? {});
        if (found) setSvc(found);
        else setMissing(true);
      })
      .catch(() => setMissing(true));
    fetch(`${apiBase}/api/models`)
      .then((r) => r.json())
      .then((d) => setModels(Object.fromEntries(((d.models as Model[]) ?? []).map((m) => [m.id, m.label]))))
      .catch(() => undefined);
    fetch(`${apiBase}/api/service-kinds`)
      .then((r) => r.json())
      .then((d) => setKinds(Object.fromEntries(((d.kinds as { id: string; label: string }[]) ?? []).map((k) => [k.id, k.label]))))
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

  const back = { href: featureId ? `/build?view=pipeline&feature=${featureId}` : "/build?view=pipeline", label: "Feature pipeline" };

  if (missing)
    return (
      <main className="page">
        <PageHeader back={back} title={name} />
        <div className="card"><Empty icon={Icon.service}>Service {name} is not in the registry.</Empty></div>
      </main>
    );
  if (!svc)
    return (
      <main className="page">
        <PageHeader back={back} title={name} />
        <Skeleton rows={2} height={120} />
      </main>
    );

  const logTone = streaming ? "run" : finished ? "ok" : "";
  const logLabel = streaming ? "Live" : finished ? "Complete" : featureId ? "Idle" : "No feature";

  return (
    <main className="page">
      <PageHeader
        back={back}
        title={
          <span className={styles.title}>
            <span className={styles.icon}>{Icon.service}</span>
            {svc.name}
          </span>
        }
        lede={svc.stack}
        actions={
          <>
            {svc.kind && <span className="badge">{kinds[svc.kind] ?? svc.kind}</span>}
            {svc.owner && <span className="badge">{svc.owner}</span>}
          </>
        }
      />

      <div className={styles.grid}>
        <div className="card cardPad">
          <h2 className={styles.blockTitle}>Overview</h2>
          <dl className={styles.dl}>
            <dt>Owner</dt><dd>{svc.owner ?? "unknown"}</dd>
            <dt>Repository</dt><dd className="mono">{svc.repo ?? "n/a"}</dd>
            {svc.db && <><dt>Database</dt><dd>{svc.db.engine}{svc.db.name ? ` (${svc.db.name})` : ""}</dd></>}
            {svc.api && <><dt>API</dt><dd>{svc.api.kind} {svc.api.version ?? ""}</dd></>}
          </dl>
        </div>

        <div className="card cardPad">
          <h2 className={styles.blockTitle}>Exposes</h2>
          {svc.exposes.length ? (
            <div className={styles.chips}>{svc.exposes.map((e) => <span key={e} className="chip mono">{e}</span>)}</div>
          ) : <p className="muted">Nothing exposed.</p>}
        </div>

        <div className="card cardPad">
          <h2 className={styles.blockTitle}>Communicates with</h2>
          {Object.keys(svc.consumes).length ? (
            <ul className={styles.list}>
              {Object.entries(svc.consumes).map(([dep, mods]) => (
                <li key={dep}>
                  <Link href={`/service/${dep}${featureId ? `?feature=${featureId}` : ""}`} className={styles.dep}>
                    {dep}
                    <span className={styles.chev}>{Icon.chevron}</span>
                  </Link>
                  <span className={styles.mods}>{mods.join(", ")}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">No dependencies.</p>}
        </div>
      </div>

      <section className="section">
        <div className="sectionHead">
          <h2>Events</h2>
          <span className="count">from the contract in the registry</span>
        </div>
        {eventsFor(contracts, [svc.name]).length ? (
          eventsFor(contracts, [svc.name]).map(([evName, e]) => (
            <div key={evName} className="card">
              <ContractEvent name={evName} event={e} highlight={svc.name} />
            </div>
          ))
        ) : (
          <div className="card">
            <Empty icon={Icon.link}>This service neither sends nor receives events.</Empty>
          </div>
        )}
      </section>

      {/* Detailed work log: exactly what the agent did on this service, step by step. */}
      <div className="card">
        <div className="cardHead">
          <h2>Work log</h2>
          <span className={styles.logState}>
            <span className={`badge ${logTone}`}>
              {logTone && <span className={`dot ${logTone}`} />}
              {logLabel}
            </span>
            <span className="badge">{log.length} steps</span>
          </span>
        </div>
        <div className={styles.logBody} ref={logRef}>
          {log.length === 0 ? (
            <Empty icon={Icon.inbox}>
              {featureId ? "Waiting for an agent to touch this service." : "No feature references this service yet."}
            </Empty>
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
                    <span className={styles.logMeta}>
                      {l.agent}
                      <ModelChip id={l.model} label={models[l.model] ?? l.model} />
                    </span>
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
