import Link from "next/link";
import styles from "./contracts.module.css";
import type { EventContract } from "./lib/contracts";

/**
 * One event contract read left to right: who sends it, the event with the exact
 * shape of its data, who reacts to it. The shape is the promise every side codes to.
 */
export default function ContractEvent({ name, event, highlight }: { name: string; event: EventContract; highlight?: string }) {
  const side = (list: string[] | undefined, label: string) => (
    <div className={styles.side}>
      <span className={styles.sideLabel}>{label}</span>
      {(list ?? []).length ? (
        (list ?? []).map((s) => (
          <Link key={s} href={`/service/${s}`} className={`chip mono ${s === highlight ? styles.me : ""}`}>
            {s}
          </Link>
        ))
      ) : (
        <span className="muted">nobody</span>
      )}
    </div>
  );
  const fields = Object.entries(event.payload ?? {});
  return (
    <div className={styles.event}>
      {side(event.producers, "Sent by")}
      <span className={styles.arrow} aria-hidden="true" />
      <div className={styles.contract}>
        <code className={styles.eventName}>{name}</code>
        <dl className={styles.payload}>
          {fields.length ? (
            fields.map(([k, t]) => (
              <div key={k} className={styles.field}>
                <dt>{k}</dt>
                <dd>{t}</dd>
              </div>
            ))
          ) : (
            <span className="muted">no data</span>
          )}
        </dl>
      </div>
      <span className={styles.arrow} aria-hidden="true" />
      {side(event.consumers, "Received by")}
    </div>
  );
}
