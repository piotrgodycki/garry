import { useCallback, useEffect, useState } from "react";
import type { MemoryEntry } from "garry-client";
import { client } from "../lib/client";
import Illustrated from "../Illustrations";
import { PageHeader, ServerNotice, Skeleton } from "../ui";
import styles from "./memory.module.css";

/**
 * Garry's memory of the project: what you asked it to keep in mind (here, or
 * with /remember in Garry's field). Every agent working in the project reads
 * it before it starts.
 */
export default function Memory() {
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => client.garryMemory().then((e) => (setEntries(e), setOffline(false)), () => setOffline(true)), []);
  useEffect(() => void load(), [load]);

  const act = async (p: Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await p;
      await load();
      return true;
    } catch (e) {
      setError(String((e as Error).message ?? e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <PageHeader title="Memory" lede="What Garry keeps in mind about this project. Every agent working in it reads this before it starts. Add here, or type /remember in Garry's field; /forget drops one." />
      {offline && <ServerNotice />}
      <form
        className={`card ${styles.add}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void act(client.remember(text)).then((ok) => ok && setText(""));
        }}
      >
        <label className="fieldLabel" htmlFor="memory-new">
          Something to remember
        </label>
        <div className={styles.addRow}>
          <input id="memory-new" className="input" placeholder="e.g. We deploy on Fridays, so keep changes small then" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
          <button className="btn btnPrimary" disabled={busy || !text.trim()}>
            Remember
          </button>
        </div>
        {error && (
          <span className="badge danger" role="alert">
            {error}
          </span>
        )}
      </form>
      {entries === null ? (
        <Skeleton rows={3} height={52} />
      ) : entries.length === 0 ? (
        <Illustrated art="plantFeature" title="Nothing remembered yet">
          House rules, decisions, things to avoid: one at a time, in a sentence.
        </Illustrated>
      ) : (
        <ol className={styles.list} aria-label="what Garry remembers">
          {entries.map((e, i) => (
            <li key={e.id} className="card">
              <span className={styles.no}>{i + 1}</span>
              <span className={styles.text}>{e.text}</span>
              <span className={styles.when}>{new Date(e.createdAt).toLocaleDateString()}</span>
              <button className="btn btnSm btnGhost" disabled={busy} aria-label={`forget: ${e.text}`} onClick={() => void act(client.forget(e.id))}>
                Forget
              </button>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
