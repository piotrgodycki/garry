"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./agent.module.css";
import ModelChip from "../ModelChip";
import Waveform from "../Waveform";
import VoiceAgent from "../VoiceAgent";
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
interface LogEntry {
  index: number;
  stage: string;
  who: string;
  agent: string;
  model: string;
  skill: string;
  action: string;
}

const C = 280; // stage center in viewBox units
const R = 200; // orbit radius

/** A gentle curved path between two points (quadratic bezier arced to one side). */
function curve(x1: number, y1: number, x2: number, y2: number, bend = 0.1): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * len * bend;
  const cy = my + (dx / len) * len * bend;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

export default function AgentView() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [selected, setSelected] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [models, setModels] = useState<Record<string, string>>({});
  const [consumes, setConsumes] = useState<Record<string, string[]>>({});
  const [current, setCurrent] = useState<number | null>(null);
  const [done, setDone] = useState(0);
  const [finished, setFinished] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    fetch(`${apiBase}/api/features`)
      .then((r) => r.json())
      .then((d) => {
        const fs = (d.features as Feature[]) ?? [];
        setFeatures(fs);
        const wanted = new URLSearchParams(window.location.search).get("feature");
        const pick = fs.find((f) => f.id === wanted) ?? fs[0];
        if (pick) setSelected(pick.id);
      })
      .catch(() => undefined);
    fetch(`${apiBase}/api/models`)
      .then((r) => r.json())
      .then((d) => setModels(Object.fromEntries(((d.models as Model[]) ?? []).map((m) => [m.id, m.label]))))
      .catch(() => undefined);
    fetch(`${apiBase}/api/registry`)
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, string[]> = {};
        for (const s of (d.services as { name: string; consumes?: Record<string, string[]> }[]) ?? []) {
          map[s.name] = Object.keys(s.consumes ?? {});
        }
        setConsumes(map);
      })
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
    setLogs([]);
    const es = new EventSource(`${apiBase}/api/features/${selected}/stream`);
    es.addEventListener("task", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { index: number };
      setCurrent(d.index);
      setDone(d.index - 1);
    });
    es.addEventListener("log", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as LogEntry;
      setLogs((prev) => [...prev, d]);
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

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

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

  // Edges between services that communicate, from the consumes contract.
  const edges = useMemo(() => {
    const pos = new Map(nodes.map((nd) => [nd.svc, nd]));
    const out: { from: string; to: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const nd of nodes) {
      for (const dep of consumes[nd.svc] ?? []) {
        const target = pos.get(dep);
        if (target) out.push({ from: nd.svc, to: dep, x1: nd.x, y1: nd.y, x2: target.x, y2: target.y });
      }
    }
    return out;
  }, [nodes, consumes]);

  const task = current && plan ? plan.tasks[current - 1] : null;
  const busy = task !== null;
  const coreActive = busy && task?.scope === "global";
  const total = plan?.tasks.length ?? 0;
  const progress = finished ? total : done;
  const pct = total ? progress / total : 0;
  const RING_R = 94;
  const RING_C = 2 * Math.PI * RING_R;

  const serviceStatus = (svc: string): "active" | "done" | "idle" => {
    if (!plan) return "idle";
    if (task?.scope === "service" && task.service === svc) return "active";
    const idxs = plan.tasks.map((t, i) => (t.scope === "service" && t.service === svc ? i + 1 : -1)).filter((i) => i > 0);
    if (idxs.length && idxs.every((i) => i <= done)) return "done";
    return "idle";
  };

  // The role (agent) and model a service uses right now: the live task when the
  // service is active, otherwise the baseline from its first service stage.
  const roleModel = (svc: string): { role: string; modelId: string; model: string } => {
    if (task?.scope === "service" && task.service === svc) {
      return { role: task.agent, modelId: task.model, model: models[task.model] ?? task.model };
    }
    const svcTasks = plan?.tasks.filter((t) => t.scope === "service" && t.service === svc) ?? [];
    const first = svcTasks[0];
    const id = first?.model ?? "";
    return { role: first?.agent ?? "", modelId: id, model: id ? models[id] ?? id : "" };
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.pick}>
        <span className={styles.pickLabel}>feature</span>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="feature">
          {features.map((f) => (
            <option key={f.id} value={f.id}>{f.id} {f.title}</option>
          ))}
        </select>
        <button className={styles.run} onClick={() => setRunKey((k) => k + 1)}>run</button>
      </div>

      <div className={styles.stage}>
        <svg className={styles.links} viewBox="0 0 560 560" aria-hidden="true">
          <defs>
            <radialGradient id="spokeFade" cx={C} cy={C} r={R} gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: "var(--color-brand-primary)", stopOpacity: 0.5 }} />
              <stop offset="0.55" style={{ stopColor: "var(--color-brand-primary)", stopOpacity: 0.16 }} />
              <stop offset="1" style={{ stopColor: "var(--color-brand-primary)", stopOpacity: 0 }} />
            </radialGradient>
            <radialGradient id="spokeFadeActive" cx={C} cy={C} r={R} gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: "var(--color-brand-secondary)", stopOpacity: 0.95 }} />
              <stop offset="0.7" style={{ stopColor: "var(--color-brand-secondary)", stopOpacity: 0.5 }} />
              <stop offset="1" style={{ stopColor: "var(--color-brand-secondary)", stopOpacity: 0.1 }} />
            </radialGradient>
          </defs>
          {/* inter service communication arcs, only while a related service is active */}
          {edges.map((e) => {
            const hot = serviceStatus(e.from) === "active" || serviceStatus(e.to) === "active";
            if (!hot) return null;
            const id = `e-${e.from}-${e.to}`;
            const d = curve(e.x1, e.y1, e.x2, e.y2, 0.16);
            return (
              <g key={id}>
                <path id={id} d={d} className={styles.edgePath} />
                <circle r={3.2} className={styles.pulseEdge}>
                  <animateMotion dur="1.1s" repeatCount="indefinite">
                    <mpath href={`#${id}`} />
                  </animateMotion>
                </circle>
              </g>
            );
          })}
          {/* spokes from the hub to each service, each carrying a flowing pulse */}
          {nodes.map((nd) => {
            const st = serviceStatus(nd.svc);
            const id = `s-${nd.svc}`;
            const d = curve(C, C, nd.x, nd.y, 0.08);
            return (
              <g key={id}>
                <path id={id} d={d} className={`${styles.spoke} ${st === "active" ? styles.spokeActive : ""} ${st === "done" ? styles.spokeDone : ""}`} />
                {st === "active" && (
                  <circle r={4} className={styles.pulseActive}>
                    <animateMotion dur="1s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                      <mpath href={`#${id}`} />
                    </animateMotion>
                  </circle>
                )}
              </g>
            );
          })}
          {/* progress ring around the hub */}
          <circle cx={C} cy={C} r={RING_R} className={styles.ringTrack} />
          <circle
            cx={C}
            cy={C}
            r={RING_R}
            className={styles.ringProgress}
            strokeDasharray={`${(pct * RING_C).toFixed(1)} ${RING_C.toFixed(1)}`}
            transform={`rotate(-90 ${C} ${C})`}
          />
        </svg>

        <div className={`${styles.voice} ${busy ? styles.voiceActive : ""}`}>
          <span className={styles.halo} />
          <div className={styles.eq}>
            {Array.from({ length: 72 }).map((_, i) => {
              const phase = Math.abs((i % 18) - 9);
              return (
                <span key={i} className={styles.spoke} style={{ transform: `rotate(${(i * 360) / 72}deg) translateY(-104px)` }}>
                  <span className={styles.eqbar} style={{ animationDelay: `${(phase * 0.045).toFixed(2)}s` }} />
                </span>
              );
            })}
          </div>
          <button
            className={`${styles.core} ${busy ? styles.busy : ""}`}
            onClick={() => setVoiceOpen(true)}
            title="talk to Garry"
            aria-label="talk to Garry"
          >
            <div className={styles.coreWave}>
              <Waveform bars={11} active={busy} />
            </div>
            <span className={styles.coreHint}>talk</span>
          </button>
        </div>

        {nodes.map((nd) => {
          const st = serviceStatus(nd.svc);
          const rm = roleModel(nd.svc);
          return (
            <Link
              key={nd.svc}
              href={`/service/${nd.svc}`}
              className={`${styles.node} ${st === "active" ? styles.active : ""} ${st === "done" ? styles.done : ""}`}
              style={{ left: `${nd.left}%`, top: `${nd.top}%` }}
              title={`open ${nd.svc}`}
            >
              <div className={styles.bubble}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.icon} src="/service.svg" alt="" />
                <span className={`${styles.statusDot} ${styles[`dot_${st}`]}`} />
              </div>
              <span className={styles.svc}>{nd.svc}</span>
              <span className={styles.stageLabel}>{st === "active" ? (task?.stage ?? "") : st === "done" ? "done" : "waiting"}</span>
              <div className={styles.tags}>
                <span className={styles.role}>{rm.role}</span>
                <ModelChip id={rm.modelId} label={rm.model} />
              </div>
            </Link>
          );
        })}
      </div>

      <div className={styles.statusbar}>
        <Waveform bars={28} active={busy} />
        <div className={styles.statusMain}>
          <div className={styles.action}>
            {task ? (
              task.scope === "service" ? (
                <>working on <span className={styles.em}>{task.service}</span> · {task.stage}</>
              ) : (
                <><span className={styles.em}>{task.stage}</span> · supervisor</>
              )
            ) : finished ? (
              <>run complete</>
            ) : (
              <span className={styles.idle}>idle, press run</span>
            )}
          </div>
          <div className={styles.sub}>{task ? `${task.agent} · ${models[task.model] ?? task.model}` : plan ? `${plan.order.length} services` : "connect the server with pnpm serve"}</div>
        </div>
        <div className={styles.progressBox}>
          <span className={styles.progressNum}>{progress}<span className={styles.progressTotal}> / {total}</span></span>
          <span className={styles.progressLabel}>tasks</span>
        </div>
        <div className={styles.legend}>
          <span><span className="dot wait" /> waiting</span>
          <span><span className="dot run" /> running</span>
          <span><span className="dot ok" /> done</span>
        </div>
        <button className={styles.replay} onClick={() => setRunKey((k) => k + 1)}>replay</button>
      </div>

      <div className={styles.logPanel}>
        <div className={styles.logHead}>
          <span>agent work log</span>
          <span className={styles.logCount}>{logs.length}</span>
        </div>
        <div className={styles.logBody} ref={logRef}>
          {logs.length === 0 ? (
            <div className={styles.logEmpty}>run a feature to see the agent work log</div>
          ) : (
            logs.map((l, i) => (
              <div key={i} className={styles.logRow}>
                <span className={styles.logStage}>{l.stage}</span>
                <span className={styles.logWho}>{l.who}</span>
                <span className={styles.logAction}>{l.action}</span>
                <span className={styles.logSkill}>{l.skill}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <VoiceAgent open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </div>
  );
}
