import type { RefObject } from "react";
import styles from "./agent.module.css";
import { Icon } from "../icons";
import { Empty } from "../ui";

export interface TaskLogEntry {
  index: number;
  stage: string;
  who: string;
  agent: string;
  model: string;
}

/** The feature's work log: one line per task, who did it with which model, how many steps it took. */
export default function WorkLog({ taskLog, logs, current, total, models, logRef }: { taskLog: TaskLogEntry[]; logs: { index: number }[]; current: number | null; total: number; models: Record<string, string>; logRef: RefObject<HTMLDivElement | null> }) {
  return (
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
  );
}
