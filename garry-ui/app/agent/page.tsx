import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "../lib/router";
import styles from "./agent.module.css";
import ModelChip from "../ModelChip";
import ContractPanel from "./ContractPanel";
import Waveform from "../Waveform";
import GarryMark from "../GarryMark";
import { apiBase } from "../lib/api";
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
  feature: { id: string; title: string; contractChanges?: string[] };
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
  const [noFeatures, setNoFeatures] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/features`)
      .then((r) => r.json())
      .then((d) => {
        const fs = (d.features as Feature[]) ?? [];
        setFeatures(fs);
        setNoFeatures(fs.length === 0);
        const wanted = new URLSearchParams(window.location.search).get("feature");
        const pick = fs.find((f) => f.id === wanted) ?? fs[0];
        if (pick) setSelected(pick.id);
      })
      .catch(() => setOffline(true));
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
    setStopped(false);
    setLogs([]);
    setTaskLog([]);
    const es = new EventSource(`${apiBase}/api/features/${selected}/stream`);
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
    fetch(`${apiBase}/api/features/${selected}/stop`, { method: "POST" }).catch(() => undefined);
  };

  const pickFeature = (id: string) => {
    setSelected(id);
    window.history.replaceState(null, "", `/agent?feature=${id}`);
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

  // The flow, left to right: one column per stage (in the order the plan runs
  // them), one lane for Garry's own work and one per service.
  const flow = useMemo(() => {
    const tasks = plan?.tasks ?? [];
    const stages = [...new Set(tasks.map((t) => t.stage))];
    const lanes = [...(tasks.some((t) => t.scope === "global") ? ["supervisor"] : []), ...(plan?.order ?? [])];
    const cell = new Map<string, number[]>();
    tasks.forEach((t, i) => {
      const key = `${t.scope === "global" ? "supervisor" : t.service}|${t.stage}`;
      cell.set(key, [...(cell.get(key) ?? []), i + 1]);
    });
    return { stages, lanes, cell };
  }, [plan]);
  const nodes = (plan?.order ?? []).map((svc) => ({ svc }));

  const task = current && plan ? plan.tasks[current - 1] : null;
  const busy = task !== null;
  const coreActive = busy && task?.scope === "global";
  const total = plan?.tasks.length ?? 0;
  const progress = finished ? total : done;
  const pct = total ? progress / total : 0;
  const taskState = (i: number): "active" | "done" | "idle" => (current === i ? "active" : finished || i <= done ? "done" : "idle");
  const stageState = (stage: string): "active" | "done" | "idle" => {
    const idx = (plan?.tasks ?? []).map((t, i) => (t.stage === stage ? i + 1 : -1)).filter((i) => i > 0);
    if (idx.some((i) => taskState(i) === "active")) return "active";
    return idx.length && idx.every((i) => taskState(i) === "done") ? "done" : "idle";
  };

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

  const featureTitle = plan?.feature.title ?? (offline || noFeatures ? "Live agents" : "Loading feature");
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
        lede="The orchestration from left to right: each stage, and the agent and model doing it for Garry and for every service. Click a service for its detailed work log."
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

      {noFeatures && (
        <div className="notice" role="status">
          {Icon.alert}
          <div>
            <strong>No features yet</strong>
            <span>
              Capture an idea on the <Link href="/">dashboard</Link> and talk it through with Garry, or start with your services in
              the <Link href="/registry">registry</Link>.
            </span>
          </div>
        </div>
      )}

      {offline && (
        <div className="notice" role="alert">
          {Icon.alert}
          <div>
            <strong>Cannot reach garry-server</strong>
            <span>Start it with <code>pnpm serve</code>, then reload.</span>
          </div>
        </div>
      )}

      {/* Phones get a list instead of the orbit map: same data, readable at 360px. */}
      <div className={styles.mobile}>
        <div className={`card ${styles.mHub}`}>
          <GarryMark size={44} busy={busy} />
          <div className={styles.mHubText}>
            <span className={styles.mHubPct}>{Math.round(pct * 100)}%</span>
            <span className={styles.mHubSub}>{progress} of {total} tasks</span>
          </div>
          <button className="btn btnSm" onClick={() => window.dispatchEvent(new Event("garry:voice"))} aria-label="talk to Garry">
            {Icon.mic}
            Talk
          </button>
        </div>
        <ul className={styles.mList}>
          {nodes.map((nd) => {
            const st = serviceStatus(nd.svc);
            const rm = roleModel(nd.svc);
            return (
              <li key={nd.svc}>
                <Link href={`/service/${nd.svc}?feature=${selected}`} className={`card ${styles.mRow} ${st === "active" ? styles.mRowActive : ""}`}>
                  <span className={`dot ${st === "active" ? "run" : st === "done" ? "ok" : "wait"}`} />
                  <span className={styles.mMain}>
                    <span className={styles.mName}>{nd.svc}</span>
                    <span className={styles.mAction}>
                      {st === "active" ? (lastAction(nd.svc) ?? task?.stage ?? "") : st === "done" ? "Done" : "Waiting"}
                    </span>
                  </span>
                  <ModelChip id={rm.modelId} label={rm.model} />
                  <span className={styles.mChevron}>{Icon.chevron}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* the status of the whole run, in one line */}
      <div className={`card ${styles.runBar}`}>
        <button className={`${styles.runCore} ${busy ? styles.busy : ""}`} onClick={() => window.dispatchEvent(new Event("garry:voice"))} title="talk to Garry (Cmd/Ctrl+K)" aria-label="talk to Garry">
          <GarryMark size={34} busy={busy} />
        </button>
        <span className={`badge ${statusTone}`}>
          <span className={`dot ${statusTone}`} />
          {statusText}
        </span>
        <span className={styles.runAction}>
          {stopped ? (
            <>All agents halted</>
          ) : task ? (
            <>
              <span className={styles.em}>{task.stage}</span> {task.scope === "service" ? <>on {task.service}</> : <>by Garry</>}
              <span className={styles.runWho}>
                {task.agent} <ModelChip id={task.model} label={models[task.model] ?? task.model} />
              </span>
            </>
          ) : finished ? (
            <>Every stage is done</>
          ) : plan ? (
            <span className={styles.idle}>Waiting for the agents · {plan.order.length} services</span>
          ) : (
            <span className={styles.idle}>{noFeatures ? "No features yet" : "Connect the server with pnpm serve"}</span>
          )}
        </span>
        <span className={styles.runProgress}>
          <span className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={progress}>
            <span style={{ width: `${pct * 100}%` }} />
          </span>
          <span className={styles.progressNum}>
            {progress}
            <span className={styles.progressTotal}> / {total}</span>
          </span>
        </span>
        <span className={styles.runWave}>
          <Waveform bars={18} active={busy} />
        </span>
      </div>

      {/* the orchestration, left to right: stages as columns, Garry and each service as lanes */}
      {plan && flow.stages.length > 0 && (
        <div className={`card ${styles.flowCard}`}>
          <div className={styles.flow} style={{ gridTemplateColumns: `152px repeat(${flow.stages.length}, minmax(108px, 1fr))` }}>
            <span className={styles.flowCorner} />
            {flow.stages.map((stage, i) => {
              const st = stageState(stage);
              return (
                <div key={stage} className={`${styles.flowStage} ${styles[`st_${st}`]}`}>
                  <span className={styles.flowStep}>{st === "done" ? Icon.check : i + 1}</span>
                  <span className={styles.flowStageName}>{stage}</span>
                </div>
              );
            })}
            {flow.lanes.map((lane) => {
              const isGarry = lane === "supervisor";
              const laneSt = isGarry ? (task?.scope === "global" ? "active" : "idle") : serviceStatus(lane);
              return [
                <div key={`${lane}-head`} className={`${styles.flowLane} ${styles[`st_${laneSt}`]}`}>
                  {isGarry ? (
                    <>
                      <span className={styles.laneIcon}>
                        <GarryMark size={18} busy={task?.scope === "global"} />
                      </span>
                      <span className={styles.laneName}>Garry</span>
                    </>
                  ) : (
                    <Link href={`/service/${lane}?feature=${selected}`} className={styles.laneLink} title={`open ${lane}`}>
                      <span className={styles.laneIcon}>{Icon.service}</span>
                      <span className={styles.laneName}>{lane}</span>
                    </Link>
                  )}
                </div>,
                ...flow.stages.map((stage) => {
                  const idx = flow.cell.get(`${lane}|${stage}`) ?? [];
                  return (
                    <div key={`${lane}-${stage}`} className={styles.flowCell}>
                      <span className={styles.flowRail} />
                      {idx.map((i) => {
                        const t = plan.tasks[i - 1];
                        const ts = taskState(i);
                        return (
                          <div key={i} className={`${styles.flowTask} ${styles[`st_${ts}`]}`} title={`${t.stage} · ${t.agent} · ${models[t.model] ?? t.model}`}>
                            <span className={`dot ${ts === "active" ? "run" : ts === "done" ? "ok" : "wait"}`} />
                            <span className={styles.flowTaskText}>
                              <span className={styles.flowAgent}>{ts === "active" && !isGarry ? (lastAction(lane) ?? t.agent) : t.agent}</span>
                              <ModelChip id={t.model} label={models[t.model] ?? t.model} />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }),
              ];
            })}
          </div>
        </div>
      )}

      <div className={styles.below}>
        {plan && (
          <ContractPanel
            contractChanges={plan.feature.contractChanges ?? []}
            order={plan.order}
            tasks={plan.tasks}
            current={current}
            done={finished ? plan.tasks.length : done}
          />
        )}

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
    </main>
  );
}
