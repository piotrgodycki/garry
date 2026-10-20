"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "../panel.module.css";
import { tierOf } from "../ModelChip";
import { api } from "../lib/api";
import { Icon } from "../icons";
import { PageHeader, ServerNotice, Skeleton } from "../ui";

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
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      api(`/api/routing`).then((r) => r.json()),
      api(`/api/models`).then((r) => r.json()),
    ])
      .then(([r, m]) => {
        setData(r as RoutingData);
        setModels((m.models as Model[]) ?? []);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);
  useEffect(() => load(), [load]);

  const change = (stage: string, model: string) => {
    api(`/api/routing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage, model }),
    })
      .then((r) => r.json())
      .then((r: RoutingData) => {
        setData(r);
        setSaved(stage);
        setTimeout(() => setSaved((s) => (s === stage ? null : s)), 2000);
      })
      .catch(() => undefined);
  };

  const label = (id: string) => models.find((m) => m.id === id)?.label ?? id;
  const stages = Object.entries(data?.stages ?? {});

  return (
    <main className="page">
      <PageHeader
        eyebrow="Configure"
        title="Model routing"
        lede="Which agent role and which model handle each SDLC stage. A change is saved to garry.routing.json and applies to the next run. The agent role stays."
      />

      {error && <ServerNotice />}
      {!data && !error && <Skeleton rows={4} height={48} />}

      {data && (
        <>
          <div className={`card ${styles.defaultRoute}`}>
            <span className={styles.defaultIcon}>{Icon.routing}</span>
            <div>
              <div className={styles.defaultLabel}>Default route</div>
              <div className={styles.defaultValue}>
                {data.defaults ? (
                  <>
                    {data.defaults.agent} · <span className={`tier ${tierOf(data.defaults.model)}`} style={{ display: "inline-block" }} /> {label(data.defaults.model)}
                  </>
                ) : (
                  "None, every stage is routed explicitly"
                )}
              </div>
            </div>
          </div>

          <div className="card tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th className={styles.agentCol}>Agent</th>
                  <th>Model</th>
                  <th aria-label="status"></th>
                </tr>
              </thead>
              <tbody>
                {stages.map(([stage, r]) => (
                  <tr key={stage}>
                    <td className={`strong ${styles.cap}`}>
                      {stage}
                      <span className={`chip mono ${styles.agentInline}`}>{r.agent}</span>
                    </td>
                    <td className={styles.agentCol}><span className="chip mono">{r.agent}</span></td>
                    <td>
                      <label className={styles.modelCell}>
                        <span className={`tier ${tierOf(r.model)}`} />
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
                    <td className={styles.savedCell}>
                      {saved === stage && <span className="badge ok">{Icon.check}Saved</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="hint">
            <span className="tier opus" /> Opus
            <span className="tier sonnet" /> Sonnet
            <span className="tier haiku" /> Haiku
            <span className="tier fable" /> Fable
          </div>
        </>
      )}
    </main>
  );
}
