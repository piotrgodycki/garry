"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./agent.module.css";
import ModelChip from "../ModelChip";
import Waveform from "../Waveform";
import GarryMark from "../GarryMark";
import { api, apiUrl } from "../lib/api";
import { Icon } from "../icons";
import { Empty, PageHeader } from "../ui";

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
const STAGE = 2 * C; // stage size in px at full scale

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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [taskLog, setTaskLog] = useState<{ index: number; stage: string; who: string; agent: string; model: string }[]>([]);
  const [stopped, setStopped] = useState(false);
  const [offline, setOffline] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // User placed positions for the service nodes (percent of the stage box). When a
  // service has no override it falls back to its computed orbit position.
  const [pos, setPos] = useState<Record<string, { left: number; top: number }>>({});
  const stageRef = useRef<HTMLDivElement>(null);
  // The stage is drawn at 560px and scaled down to fit narrow screens (phones,
  // portrait tablets), so the hub, the orbit and the nodes keep their proportions.
  const stageCardRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const card = stageCardRef.current;
    if (!card) return;
    const ro = new ResizeObserver(([entry]) => {
      const pad = parseFloat(getComputedStyle(card).paddingLeft) + parseFloat(getComputedStyle(card).paddingRight);
      setFit(Math.min(1, (entry.contentRect.width + pad - 16) / STAGE));
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, []);
  const dragRef = useRef<{ svc: string; sx: number; sy: number; baseLeft: number; baseTop: number; moved: boolean } | null>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    api(`/api/features`)
      .then((r) => r.json())
      .then((d) => {
        const fs = (d.features as Feature[]) ?? [];
        setFeatures(fs);
        const wanted = new URLSearchParams(window.location.search).get("feature");
        const pick = fs.find((f) => f.id === wanted) ?? fs[0];
        if (pick) setSelected(pick.id);
      })
      .catch(() => setOffline(true));
    api(`/api/models`)
      .then((r) => r.json())
      .then((d) => setModels(Object.fromEntries(((d.models as Model[]) ?? []).map((m) => [m.id, m.label]))))
      .catch(() => undefined);
    api(`/api/registry`)
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
    api(`/api/features/${selected}/plan`)
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
    setStopped(false);
    setLogs([]);
    setTaskLog([]);
    const es = new EventSource(apiUrl(`/api/features/${selected}/stream`));
    esRef.current = es;
    es.addEventListener("task", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { index: number; task: Task };
      setCurrent(d.index);
      setDone(d.index - 1);
      const who = d.task.scope === "service" ? d.task.service ?? "service" : "supervisor";
      setTaskLog((prev) => [...prev, { index: d.index, stage: d.task.stage, who, agent: d.task.agent, model: d.task.model }]);
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
  }, [selected, plan !== null]);

  // Stop every agent on this feature: close the live stream and halt. Best effort
  // POST so the backend can abort delegation once that endpoint exists.
  const stopAll = () => {
    esRef.current?.close();
    esRef.current = null;
    setCurrent(null);
    setStopped(true);
    api(`/api/features/${selected}/stop`, { method: "POST" }).catch(() => undefined);
  };

  const pickFeature = (id: string) => {
    setSelected(id);
    setPos({});
    window.history.replaceState(null, "", `/agent?feature=${id}`);
  };

  // Drag the service nodes around the stage. Positions are percent of the stage box.
  const clampPct = (v: number) => Math.max(5, Math.min(95, v));
  const onNodeDown = (e: React.PointerEvent, svc: string, curLeft: number, curTop: number) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { svc, sx: e.clientX, sy: e.clientY, baseLeft: curLeft, baseTop: curTop, moved: false };
  };
  const onNodeMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - d.sx) / rect.width) * 100;
    const dy = ((e.clientY - d.sy) / rect.height) * 100;
    if (Math.abs(e.clientX - d.sx) > 3 || Math.abs(e.clientY - d.sy) > 3) {
      d.moved = true;
      draggedRef.current = true;
    }
    setPos((p) => ({ ...p, [d.svc]: { left: clampPct(d.baseLeft + dx), top: clampPct(d.baseTop + dy) } }));
  };
  const onNodeUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
    if (d?.moved) setTimeout(() => (draggedRef.current = false), 0);
    else draggedRef.current = false;
  };
  const onNodeClick = (e: React.MouseEvent) => {
    if (draggedRef.current) {
      e.preventDefault();
      draggedRef.current = false;
    }
  };

  // the latest detailed (per skill) action for a service, shown on its own node
  const lastAction = (svc: string): string | null => {
    for (let i = logs.length - 1; i >= 0; i--) if (logs[i].who === svc) return logs[i].action;
    return null;
  };

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const baseNodes = useMemo(() => {
    const order = plan?.order ?? [];
    const n = order.length || 1;
    return order.map((svc, i) => {
      const a = (-90 + (i * 360) / n) * (Math.PI / 180);
      const x = C + R * Math.cos(a);
      const y = C + R * Math.sin(a);
      return { svc, x, y, left: (x / (C * 2)) * 100, top: (y / (C * 2)) * 100 };
    });
  }, [plan]);

  // Effective node positions: the user override wins over the computed orbit. The
  // spokes and arcs read from here too, so the lines follow a dragged node.
  const nodes = useMemo(
    () =>
      baseNodes.map((nd) => {
        const p = pos[nd.svc];
        if (!p) return nd;
        const left = p.left;
        const top = p.top;
        return { svc: nd.svc, left, top, x: (left / 100) * (C * 2), y: (top / 100) * (C * 2) };
      }),
    [baseNodes, pos],
  );

  // Edges between services that communicate, from the consumes contract.
  const edges = useMemo(() => {
    const posMap = new Map(nodes.map((nd) => [nd.svc, nd]));
    const out: { from: string; to: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const nd of nodes) {
      for (const dep of consumes[nd.svc] ?? []) {
        const target = posMap.get(dep);
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

  const featureTitle = plan?.feature.title ?? (offline ? "Live agents" : "Loading feature");
  const statusTone = stopped ? "danger" : finished ? "ok" : busy ? "run" : "wait";
  const statusText = stopped ? "Stopped" : finished ? "Shipped" : busy ? "Running" : "Waiting";

  return (
    <main className={`page ${styles.page}`}>
      <PageHeader
        back={{ href: "/", label: "Dashboard" }}
        title={
          <span className={styles.titleRow}>
            {plan && <span className={styles.featureId}>{plan.feature.id}</span>}
            {featureTitle}
          </span>
        }
        lede="Garry sits at the center and delegates each stage to one agent per service. Drag a service to rearrange the map, click it for its detailed work log."
        actions={
          <>
            {features.length > 1 && (
              <select className="select" value={selected} onChange={(e) => pickFeature(e.target.value)} aria-label="feature">
                {features.map((f) => (
                  <option key={f.id} value={f.id}>{f.id} {f.title}</option>
                ))}
              </select>
            )}
            <button className="btn btnDanger" onClick={stopAll} disabled={stopped || finished || !plan} aria-label="stop all agents">
              {Icon.stop}
              {stopped ? "Stopped" : "Stop all agents"}
            </button>
          </>
        }
      />

      {offline && (
        <div className="notice" role="alert">
          {Icon.alert}
          <div>
            <strong>Cannot reach garry-server</strong>
            <span>Start it with <code>pnpm serve</code>, then reload.</span>
          </div>
        </div>
      )}

      <div className={styles.layout}>
      <div className={`card ${styles.stageCard}`} ref={stageCardRef}>
      <div className={styles.stage} ref={stageRef} style={{ zoom: fit }}>
        <svg className={styles.links} viewBox="0 0 560 560" aria-hidden="true">
          <defs>
            <radialGradient id="spokeFade" cx={C} cy={C} r={R} gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: "var(--color-text-muted)", stopOpacity: 0.55 }} />
              <stop offset="1" style={{ stopColor: "var(--color-text-muted)", stopOpacity: 0.12 }} />
            </radialGradient>
            <linearGradient id="brandStroke" x1="0" y1="0" x2="560" y2="560" gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: "var(--color-brand-primary)" }} />
              <stop offset="1" style={{ stopColor: "var(--color-brand-secondary)" }} />
            </linearGradient>
          </defs>
          {/* orbit guide the services sit on */}
          <circle cx={C} cy={C} r={R} className={styles.orbitGuide} />
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
            {Array.from({ length: 60 }).map((_, i) => {
              const phase = Math.abs((i % 15) - 7);
              return (
                <span key={i} className={styles.eqSpoke} style={{ transform: `rotate(${(i * 360) / 60}deg) translateY(-84px)` }}>
                  <span className={styles.eqbar} style={{ animationDelay: `${(phase * 0.05).toFixed(2)}s` }} />
                </span>
              );
            })}
          </div>
          <button
            className={`${styles.core} ${busy ? styles.busy : ""}`}
            onClick={() => window.dispatchEvent(new Event("garry:voice"))}
            title="talk to Garry (Cmd/Ctrl+K)"
            aria-label="talk to Garry"
          >
            <GarryMark size={58} busy={busy} />
            <span className={styles.corePct}>{Math.round(pct * 100)}%</span>
            <span className={styles.coreHint}>talk ⌘K</span>
          </button>
        </div>

        {nodes.map((nd) => {
          const st = serviceStatus(nd.svc);
          const rm = roleModel(nd.svc);
          return (
            <Link
              key={nd.svc}
              href={`/service/${nd.svc}?feature=${selected}`}
              className={`${styles.node} ${st === "active" ? styles.active : ""} ${st === "done" ? styles.done : ""} ${pos[nd.svc] ? styles.moved : ""}`}
              style={{ left: `${nd.left}%`, top: `${nd.top}%` }}
              title={`drag to reposition, click to open ${nd.svc}`}
              draggable={false}
              onPointerDown={(e) => onNodeDown(e, nd.svc, nd.left, nd.top)}
              onPointerMove={onNodeMove}
              onPointerUp={onNodeUp}
              onClick={onNodeClick}
            >
              <div className={styles.nodeHead}>
                <span className={styles.icon}>{Icon.service}</span>
                <span className={styles.svc}>{nd.svc}</span>
                <span className={`dot ${st === "active" ? "run" : st === "done" ? "ok" : "wait"}`} />
              </div>
              <span className={styles.stageLabel}>
                {st === "active" ? (lastAction(nd.svc) ?? task?.stage ?? "") : st === "done" ? "Done" : "Waiting"}
              </span>
              {rm.model && (
                <div className={styles.tags}>
                  <ModelChip id={rm.modelId} label={rm.model} />
                </div>
              )}
            </Link>
          );
        })}
      </div>
      <div className={styles.legend}>
        <span><span className="dot wait" /> Waiting</span>
        <span><span className="dot run" /> Running</span>
        <span><span className="dot ok" /> Done</span>
      </div>
      </div>

      <div className={styles.side}>
        <div className={`card ${styles.status}`}>
          <div className={styles.statusTop}>
            <span className={`badge ${statusTone}`}>
              <span className={`dot ${statusTone}`} />
              {statusText}
            </span>
            <span className={styles.progressNum}>
              {progress}<span className={styles.progressTotal}> / {total} tasks</span>
            </span>
          </div>
          <div className={styles.action}>
            {stopped ? (
              <>All agents halted</>
            ) : task ? (
              task.scope === "service" ? (
                <><span className={styles.em}>{task.stage}</span> on {task.service}</>
              ) : (
                <><span className={styles.em}>{task.stage}</span> by the supervisor</>
              )
            ) : finished ? (
              <>Every stage is done</>
            ) : (
              <span className={styles.idle}>Waiting for the agents</span>
            )}
          </div>
          <div className={styles.sub}>
            {task ? (
              <>
                <span>{task.agent}</span>
                <ModelChip id={task.model} label={models[task.model] ?? task.model} />
              </>
            ) : plan ? (
              `${plan.order.length} services in this feature`
            ) : (
              "Connect the server with pnpm serve"
            )}
          </div>
          <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={progress}>
            <span style={{ width: `${pct * 100}%` }} />
          </div>
          <div className={styles.wave}>
            <Waveform bars={36} active={busy} />
          </div>
        </div>

        <div className={`card ${styles.logPanel}`}>
          <div className="cardHead">
            <h2>Work log</h2>
            <span className="badge">{taskLog.length} / {total}</span>
          </div>
          <div className={styles.logBody} ref={logRef}>
            {taskLog.length === 0 ? (
              <Empty icon={Icon.inbox}>The high level work log appears as the agents work.</Empty>
            ) : (
              <ol className={styles.timeline}>
                {taskLog.map((l) => {
                  const detail = logs.filter((x) => x.index === l.index).length;
                  const live = current === l.index;
                  return (
                    <li key={l.index} className={`${styles.logRow} ${live ? styles.logRowLive : ""}`}>
                      <span className={`dot ${live ? "run" : "ok"}`} />
                      <div className={styles.logMain}>
                        <div className={styles.logLine}>
                          <span className={styles.logStage}>{l.stage}</span>
                          <span className={styles.logWho}>{l.who}</span>
                        </div>
                        <div className={styles.logAction}>
                          {l.agent} · {models[l.model] ?? l.model}
                        </div>
                      </div>
                      <span className={styles.logSkill}>{detail} {detail === 1 ? "step" : "steps"}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
      </div>
    </main>
  );
}
