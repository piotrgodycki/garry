import { useEffect, useState } from "react";
import Link from "../lib/router";
import styles from "./contract.module.css";
import { apiBase } from "../lib/api";
import { contractLabel, eventsFor, type RegistryData } from "../lib/contracts";

interface Task {
  stage: string;
  scope: "global" | "service";
  service?: string;
}

type StepState = "done" | "active" | "wait";

/**
 * Contract first, made visible: the contracts this feature changes, how far each
 * step of their life has got (designed and validated, synced into every service,
 * checked for drift), and why the services are delegated in this order.
 * Progress is derived from the same task stream the rest of the page uses.
 */
export default function ContractPanel({
  contractChanges,
  order,
  tasks,
  current,
  done,
}: {
  contractChanges: string[];
  order: string[];
  tasks: Task[];
  /** 1 based index of the running task, or null */
  current: number | null;
  /** how many tasks are done */
  done: number;
}) {
  const [registry, setRegistry] = useState<RegistryData | null>(null);
  useEffect(() => {
    fetch(`${apiBase}/api/registry`)
      .then((r) => r.json())
      .then((d: RegistryData) => setRegistry(d))
      .catch(() => undefined);
  }, []);

  const stateOf = (pred: (t: Task) => boolean): StepState => {
    const i = tasks.findIndex(pred) + 1;
    if (i === 0) return "wait";
    if (current === i) return "active";
    return i <= done ? "done" : "wait";
  };
  const design = stateOf((t) => t.stage === "design");
  const synced = order.map((s) => ({ service: s, state: stateOf((t) => t.stage === "implement" && t.service === s) }));
  const checked = order.map((s) => ({ service: s, state: stateOf((t) => t.stage === "test" && t.service === s) }));
  const roll = (list: { state: StepState }[]): StepState =>
    list.every((x) => x.state === "done") ? "done" : list.some((x) => x.state !== "wait") ? "active" : "wait";

  const steps: { title: string; detail: string; state: StepState; per?: { service: string; state: StepState }[] }[] = [
    {
      title: "Designed and validated",
      detail: "The supervisor writes the change into the registry and validates it. No code is touched before this.",
      state: design,
    },
    {
      title: "Synced into each service",
      detail: "Each agent pulls its slice of the contract into .garry/ and generates types from it.",
      state: roll(synced),
      per: synced,
    },
    {
      title: "Checked for drift",
      detail: "Tests confirm the code still matches the contract. A mismatch blocks the merge.",
      state: roll(checked),
      per: checked,
    },
  ];

  const events = registry ? eventsFor(registry.contracts, order) : [];
  const consumes = new Map((registry?.services ?? []).map((s) => [s.name, s.consumes]));
  const inFeature = new Set(order);
  const reason = (svc: string, i: number) => {
    const deps = Object.entries(consumes.get(svc) ?? {}).filter(([d]) => inFeature.has(d) && order.indexOf(d) < i);
    if (i === 0) return "goes first: the others build on what it provides";
    if (deps.length === 0) return "no dependency on the services before it";
    return `uses ${deps.map(([d, mods]) => `${mods.join(", ")} from ${d}`).join("; ")}`;
  };
  const dot = (s: StepState) => (s === "done" ? "ok" : s === "active" ? "run" : "wait");

  return (
    <div className={`card ${styles.panel}`}>
      <div className="cardHead">
        <h2>Contract first</h2>
        <Link href="/registry#contracts" className={styles.more}>All contracts</Link>
      </div>

      <div className={styles.body}>
        <div className={styles.changes}>
          <span className={styles.label}>This feature changes</span>
          {contractChanges.length ? (
            contractChanges.map((c) => (
              <span key={c} className={styles.changeChip}>
                {contractLabel(c)} <code>{c}</code>
              </span>
            ))
          ) : (
            <span className="muted">no contract, code only</span>
          )}
        </div>

        <ol className={styles.steps}>
          {steps.map((s, i) => (
            <li key={s.title} className={`${styles.step} ${styles[s.state]}`}>
              <span className={styles.num}>{s.state === "done" ? "✓" : i + 1}</span>
              <div className={styles.stepText}>
                <span className={styles.stepTitle}>{s.title}</span>
                <span className={styles.stepDetail}>{s.detail}</span>
                {s.per && (
                  <span className={styles.per}>
                    {s.per.map((p) => (
                      <span key={p.service} className={styles.perItem}>
                        <span className={`dot ${dot(p.state)}`} />
                        {p.service}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className={styles.orderBlock}>
          <span className={styles.label}>Why this order</span>
          <ol className={styles.order}>
            {order.map((svc, i) => (
              <li key={svc}>
                <span className={styles.orderNum}>{i + 1}</span>
                <span className={styles.orderText}>
                  <b>{svc}</b>
                  <span className="muted">{reason(svc, i)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {contractChanges.includes("events.json") && events.length > 0 && (
          <div className={styles.eventsBlock}>
            <span className={styles.label}>Events involved</span>
            {events.map(([name, e]) => (
              <div key={name} className={styles.eventLine}>
                <code>{name}</code>
                <span className="muted">
                  {(e.producers ?? []).join(", ")} → {(e.consumers ?? []).join(", ")}
                </span>
                <span className={styles.fields}>
                  {Object.entries(e.payload ?? {}).map(([k, t]) => `${k}: ${t}`).join(", ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
