import { useEffect, useState } from "react";
import type { Feature, RegistryService, RoutingProfiles } from "garry-client";
import Link from "./lib/router";
import { client } from "./lib/client";
import { confirmAction } from "./lib/desktop";
import styles from "./newFeature.module.css";
import Select from "./Select";

const CONTRACTS = ["events.json", "remotes.json", "shared-deps.json", "design-tokens.json", "api.json"];

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={`chip mono ${styles.toggle} ${on ? styles.on : ""}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

/** Creates a feature at the spec stage: what it is, why, and which services it touches. */
export default function NewFeature({ title: initial = "", goal: initialGoal = "", onCreated, onCancel }: { title?: string; goal?: string; onCreated: (f: Feature) => void; onCancel: () => void }) {
  const [services, setServices] = useState<RegistryService[] | null>(null);
  const [title, setTitle] = useState(initial);
  const [goal, setGoal] = useState(initialGoal);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [contracts, setContracts] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<RoutingProfiles | null>(null);
  const [routing, setRouting] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.registry().then((r) => setServices(r.services), () => setServices([]));
    client.routingProfiles().then(setProfiles, () => undefined);
  }, []);
  useEffect(() => {
    setTitle(initial);
    setGoal(initialGoal);
  }, [initial, initialGoal]);

  const flip = (set: Set<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const submit = async () => {
    if (!(await confirmAction("create a feature in Garry"))) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await client.createFeature({ title: title.trim(), goal: goal.trim() || undefined, services: [...picked], contractChanges: [...contracts], routing: routing || undefined }));
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={`card ${styles.form}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() && !busy) void submit();
      }}
    >
      <label className={styles.field}>
        <span className="eyebrow">Feature</span>
        <input className="input" placeholder="Quick cart in the header" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus />
      </label>
      <label className={styles.field}>
        <span className="eyebrow">Goal</span>
        <textarea
          className={`input ${styles.goal}`}
          placeholder="What should it do, for whom, and why. The spec stage starts from this."
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
      </label>
      <div className={styles.field}>
        <span className="eyebrow">Services it touches</span>
        {services === null ? (
          <span className="muted">Loading services…</span>
        ) : services.length === 0 ? (
          <span className="muted">
            No services yet. <Link href="/registry">Add them in Services</Link>, or leave this for the plan stage.
          </span>
        ) : (
          <div className={styles.chips}>
            {services.map((s) => (
              <Toggle key={s.name} on={picked.has(s.name)} onClick={() => setPicked((p) => flip(p, s.name))}>
                {s.name}
              </Toggle>
            ))}
          </div>
        )}
      </div>
      <div className={styles.field}>
        <span className="eyebrow">Routing</span>
        <Select
          ariaLabel="routing profile"
          value={routing}
          onChange={setRouting}
          options={[{ value: "", label: `The active profile${profiles ? ` (${profiles.active})` : ""}` }, ...(profiles?.profiles ?? []).map((p) => ({ value: p.name, label: p.name }))]}
        />
      </div>
      <div className={styles.field}>
        <span className="eyebrow">Contracts it changes</span>
        <div className={styles.chips}>
          {CONTRACTS.map((c) => (
            <Toggle key={c} on={contracts.has(c)} onClick={() => setContracts((p) => flip(p, c))}>
              {c}
            </Toggle>
          ))}
        </div>
      </div>
      <div className={styles.actions}>
        <button className="btn btnPrimary" type="submit" disabled={!title.trim() || busy}>
          {busy ? "Creating…" : "Create feature"}
        </button>
        <button className="btn btnGhost" type="button" onClick={onCancel}>
          Cancel
        </button>
        {error && <span className="badge danger">{error}</span>}
      </div>
    </form>
  );
}
