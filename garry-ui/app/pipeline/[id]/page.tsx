import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import styles from "./pipeline.module.css";
import { apiBase } from "../../lib/api";
import { offered, tierOf } from "../../ModelChip";
import { PageHeader, Skeleton } from "../../ui";

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
  previous?: boolean;
}

const GLOBAL_STAGES = ["spec", "plan", "design", "integrate"];

export default function Activity() {
  const id = useParams().id ?? "";
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

  if (!plan)
    return (
      <main className="page">
        <PageHeader back={{ href: "/", label: "Dashboard" }} title="Pipeline" lede="Loading the plan. If this takes long, start the server with pnpm serve." />
        <Skeleton rows={3} height={90} />
      </main>
    );

  const statusOf = (index1: number): "done" | "active" | "wait" => {
    if (running === index1) return "active";
    if (index1 <= doneCount) return "done";
    return "wait";
  };
  const dotOf = (st: string) => (st === "active" ? "run" : st === "done" ? "ok" : "wait");
  const indexOf = (t: Task) => plan.tasks.indexOf(t) + 1;
  const label = (id: string) => models.find((m) => m.id === id)?.label ?? id;

  const globalTasks = plan.tasks.filter((t) => t.scope === "global");
  const serviceTasks = (svc: string) => plan.tasks.filter((t) => t.scope === "service" && t.service === svc);

  return (
    <main className="page">
      <PageHeader
        back={{ href: "/", label: "Dashboard" }}
        title={plan.feature.title}
        lede={
          <>
            Delegation order:{" "}
            {plan.order.map((s, i) => (
              <span key={s}>{i > 0 && " → "}<code>{s}</code></span>
            ))}
          </>
        }
        actions={
          finished ? (
            <span className="badge ok">Shipped (dry run)</span>
          ) : running !== null ? (
            <span className="badge run"><span className="dot run" />Task {running} of {plan.tasks.length}</span>
          ) : (
            <span className="badge">Waiting for the agents</span>
          )
        }
      />

      <section className="section">
        <div className="sectionHead">
          <h2>Supervisor</h2>
          <span className="count">global stages</span>
        </div>
        <ol className={styles.stepper}>
          {GLOBAL_STAGES.map((stage) => {
            const t = globalTasks.find((x) => x.stage === stage);
            if (!t) return null;
            const st = statusOf(indexOf(t));
            return (
              <li key={stage} className={`${styles.gstage} ${styles[st]}`}>
                <span className={`dot ${dotOf(st)}`} />
                {stage}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="section">
        <div className="sectionHead">
          <h2>Services</h2>
          <span className="count">{plan.order.length} lanes · {plan.tasks.length} tasks</span>
        </div>
        <div className={styles.lanes}>
          {plan.order.map((svc) => {
            const tasks = serviceTasks(svc);
            const model = overrides[svc] ?? tasks[0]?.model ?? "";
            return (
              <div key={svc} className={`card ${styles.lane}`}>
                <div className={styles.laneHead}>
                  <span className={styles.svcName}>{svc}</span>
                  <label className={styles.modelPick}>
                    <span className={`tier ${tierOf(model)}`} />
                    <select value={model} onChange={(e) => changeModel(svc, e.target.value)} aria-label={`model for ${svc}`}>
                      {offered(models, model).map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className={styles.stages}>
                  {tasks.map((t) => {
                    const st = statusOf(indexOf(t));
                    return (
                      <div key={t.stage} className={`${styles.stage} ${styles[st]}`}>
                        <div className={styles.stageName}>
                          <span className={`dot ${dotOf(st)}`} />
                          {t.stage}
                        </div>
                        <div className={styles.stageMeta}>{t.agent} · {label(t.model)}</div>
                        <div className={styles.skills} title={t.skills.join(", ")}>{t.skills.join(", ")}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
