"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./pipeline.module.css";
import { apiBase } from "../../lib/api";

interface Task {
  stage: string;
  scope: "global" | "service";
  service?: string;
  agent: string;
  model: string;
  skills: string[];
}
interface Plan {
  feature: { id: string; title: string };
  order: string[];
  tasks: Task[];
}
interface Model {
  id: string;
  label: string;
}

const GLOBAL_STAGES = ["spec", "plan", "design", "integrate"];

export default function Activity({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<number | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [runKey, setRunKey] = useState(0);

  const loadPlan = useCallback(() => {
    Promise.all([
      fetch(`${apiBase}/api/features/${id}/plan`).then((r) => r.json()),
      fetch(`${apiBase}/api/models`).then((r) => r.json()),
      fetch(`${apiBase}/api/features/${id}/service-models`).then((r) => r.json()),
    ]).then(([p, m, sm]) => {
      setPlan(p as Plan);
      setModels((m.models as Model[]) ?? []);
      setOverrides((sm.serviceModels as Record<string, string>) ?? {});
    });
  }, [id]);

  useEffect(() => loadPlan(), [loadPlan]);

  // Live delegation stream. Restarts when runKey changes (after a model switch).
  useEffect(() => {
    if (!plan) return;
    setRunning(null);
    setDoneCount(0);
    setFinished(false);
    const es = new EventSource(`${apiBase}/api/features/${id}/stream`);
    es.addEventListener("task", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { index: number };
      setRunning(d.index);
      setDoneCount(d.index - 1);
    });
    es.addEventListener("done", () => {
      setRunning(null);
      setDoneCount((c) => c + 1);
      setFinished(true);
      es.close();
    });
    es.onerror = () => es.close();
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, runKey, plan !== null]);

  const changeModel = (service: string, model: string) => {
    fetch(`${apiBase}/api/features/${id}/service-models`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service, model }),
    })
      .then((r) => r.json())
      .then(() => {
        loadPlan();
        setRunKey((k) => k + 1);
      });
  };

  if (!plan) return <main className={styles.main}><p className={styles.muted}>Loading, or start the server with pnpm serve.</p></main>;

  const statusOf = (index1: number): "done" | "active" | "wait" => {
    if (running === index1) return "active";
    if (index1 <= doneCount) return "done";
    return "wait";
  };
  const indexOf = (t: Task) => plan.tasks.indexOf(t) + 1;

  const globalTasks = plan.tasks.filter((t) => t.scope === "global");
  const serviceTasks = (svc: string) => plan.tasks.filter((t) => t.scope === "service" && t.service === svc);

  return (
    <main className={styles.main}>
      <div className={styles.head}>
        <div>
          <p><Link href="/">back</Link></p>
          <h1>{plan.feature.title}</h1>
        </div>
        <span className="chip">{plan.tasks.length} tasks</span>
      </div>
      <p className={styles.order}>
        delegation order: {plan.order.map((s, i) => (
          <span key={s}>{i > 0 && " -> "}<code>{s}</code></span>
        ))}
      </p>

      <h2>Supervisor</h2>
      <div className={styles.supervisor}>
        {GLOBAL_STAGES.map((stage) => {
          const t = globalTasks.find((x) => x.stage === stage);
          if (!t) return null;
          const st = statusOf(indexOf(t));
          return (
            <div key={stage} className={`${styles.gstage} ${st === "active" ? styles.active : ""} ${st === "done" ? styles.done : ""}`}>
              <span className={`dot ${st === "active" ? "run" : st === "done" ? "ok" : "wait"}`} />
              {stage}
            </div>
          );
        })}
      </div>

      <h2>Services</h2>
      <div className={styles.lanes}>
        {plan.order.map((svc) => {
          const tasks = serviceTasks(svc);
          const model = overrides[svc] ?? tasks[0]?.model ?? "";
          return (
            <div key={svc} className={`card ${styles.lane}`}>
              <div className={styles.laneHead}>
                <span className={styles.svcName}>{svc}</span>
                <select
                  className={styles.select}
                  value={model}
                  onChange={(e) => changeModel(svc, e.target.value)}
                  aria-label={`model for ${svc}`}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.stages}>
                {tasks.map((t) => {
                  const st = statusOf(indexOf(t));
                  return (
                    <div key={t.stage} className={`${styles.stage} ${st === "active" ? styles.active : ""} ${st === "done" ? styles.done : ""}`}>
                      <div className={styles.stageName}>
                        <span className={`dot ${st === "active" ? "run" : st === "done" ? "ok" : "wait"}`} />
                        {t.stage}
                      </div>
                      <div className={styles.stageMeta}>{t.agent}</div>
                      <span className="chip model">{t.model}</span>
                      <div className={styles.skills} title={t.skills.join(", ")}>{t.skills.join(", ")}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <button className={styles.ghost} onClick={() => setRunKey((k) => k + 1)}>replay</button>
        {finished ? <span className={styles.done}>run complete (dry run)</span> : running !== null ? <span className="muted">running task {running} of {plan.tasks.length}</span> : <span className="muted">idle</span>}
      </div>
    </main>
  );
}
