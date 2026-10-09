"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./agent.module.css";
import { apiBase } from "../lib/api";

interface Task {
  stage: string;
  scope: "global" | "service";
  service?: string;
  agent: string;
  model: string;
}
interface Plan {
  feature: { id: string; title: string };
  order: string[];
  tasks: Task[];
}
interface Feature {
  id: string;
  title: string;
}
interface Model {
  id: string;
  label: string;
}

const C = 280; // stage center in viewBox units
const R = 200; // orbit radius

export default function AgentView() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [selected, setSelected] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [models, setModels] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<number | null>(null);
  const [done, setDone] = useState(0);
  const [finished, setFinished] = useState(false);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    fetch(`${apiBase}/api/features`)
      .then((r) => r.json())
      .then((d) => {
        const fs = (d.features as Feature[]) ?? [];
        setFeatures(fs);
        if (fs[0]) setSelected(fs[0].id);
      })
      .catch(() => undefined);
    fetch(`${apiBase}/api/models`)
      .then((r) => r.json())
      .then((d) => setModels(Object.fromEntries(((d.models as Model[]) ?? []).map((m) => [m.id, m.label]))))
      .catch(() => undefined);
  }, []);

  const loadPlan = useCallback(() => {
    if (!selected) return;
    fetch(`${apiBase}/api/features/${selected}/plan`)
      .then((r) => r.json())
      .then((p: Plan) => setPlan(p))
      .catch(() => undefined);
  }, [selected]);
  useEffect(() => loadPlan(), [loadPlan]);

  useEffect(() => {
    if (!plan) return;
    setCurrent(null);
    setDone(0);
    setFinished(false);
    const es = new EventSource(`${apiBase}/api/features/${selected}/stream`);
    es.addEventListener("task", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { index: number };
      setCurrent(d.index);
      setDone(d.index - 1);
    });
    es.addEventListener("done", () => {
      setCurrent(null);
      setFinished(true);
      setDone(plan.tasks.length);
      es.close();
    });
    es.onerror = () => es.close();
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, runKey, plan !== null]);

  const nodes = useMemo(() => {
    const order = plan?.order ?? [];
    const n = order.length || 1;
    return order.map((svc, i) => {
      const a = (-90 + (i * 360) / n) * (Math.PI / 180);
      const x = C + R * Math.cos(a);
      const y = C + R * Math.sin(a);
      return { svc, x, y, left: (x / (C * 2)) * 100, top: (y / (C * 2)) * 100 };
    });
  }, [plan]);

  const task = current && plan ? plan.tasks[current - 1] : null;
  const busy = task !== null;
  const coreActive = busy && task?.scope === "global";

  const serviceStatus = (svc: string): "active" | "done" | "idle" => {
    if (!plan) return "idle";
    if (task?.scope === "service" && task.service === svc) return "active";
    const idxs = plan.tasks.map((t, i) => (t.scope === "service" && t.service === svc ? i + 1 : -1)).filter((i) => i > 0);
    if (idxs.length && idxs.every((i) => i <= done)) return "done";
    return "idle";
  };

  // The role (agent) and model a service uses right now: the live task when the
  // service is active, otherwise the baseline from its first service stage.
  const roleModel = (svc: string): { role: string; model: string } => {
    if (task?.scope === "service" && task.service === svc) {
      return { role: task.agent, model: models[task.model] ?? task.model };
    }
    const svcTasks = plan?.tasks.filter((t) => t.scope === "service" && t.service === svc) ?? [];
    const first = svcTasks[0];
    return { role: first?.agent ?? "", model: first ? models[first.model] ?? first.model : "" };
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.pick}>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="feature">
          {features.map((f) => (
            <option key={f.id} value={f.id}>{f.id} {f.title}</option>
          ))}
        </select>
        <button className={styles.replay} onClick={() => setRunKey((k) => k + 1)}>run</button>
      </div>

      <div className={styles.stage}>
        <svg className={styles.links} viewBox="0 0 560 560" aria-hidden="true">
          {nodes.map((nd) => (
            <line
              key={nd.svc}
              x1={C}
              y1={C}
              x2={nd.x}
              y2={nd.y}
              className={`${styles.link} ${serviceStatus(nd.svc) === "active" ? styles.linkActive : ""}`}
            />
          ))}
        </svg>

        <div className={`${styles.core} ${busy ? styles.busy : ""} ${coreActive ? styles.busy : ""}`}>
          <span className={styles.ring} />
          <span className={`${styles.ring} ${styles.ring2}`} />
          <span className={`${styles.ring} ${styles.ring3}`} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/garry-logo.svg" alt="Garry" />
        </div>

        {nodes.map((nd) => {
          const st = serviceStatus(nd.svc);
          const rm = roleModel(nd.svc);
          return (
            <div
              key={nd.svc}
              className={`${styles.node} ${st === "active" ? styles.active : ""} ${st === "done" ? styles.done : ""}`}
              style={{ left: `${nd.left}%`, top: `${nd.top}%` }}
            >
              <div className={styles.bubble}>
                <span className={styles.mono}>{nd.svc.slice(0, 2).toUpperCase()}</span>
              </div>
              <span className={styles.svc}>{nd.svc}</span>
              {st === "active" && <span className={styles.stageLabel}>{task?.stage}</span>}
              <div className={styles.tags}>
                <span className={styles.role}>{rm.role}</span>
                <span className={styles.modelTag}>{rm.model}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.readout}>
        {task ? (
          task.scope === "service" ? (
            <div className={styles.action}>
              working on <span className={styles.em}>{task.service}</span>: {task.stage}
            </div>
          ) : (
            <div className={styles.action}>{task.stage} <span className={styles.em}>(supervisor)</span></div>
          )
        ) : finished ? (
          <div className={styles.action}>run complete</div>
        ) : (
          <div className={`${styles.action} ${styles.idle}`}>idle, press run</div>
        )}
        <div className={styles.sub}>
          {task ? `${task.agent} · ${task.model}` : plan ? `${plan.order.length} services · ${plan.tasks.length} tasks` : "connect the server with pnpm serve"}
        </div>
      </div>
    </div>
  );
}
