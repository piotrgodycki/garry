import { useEffect, useState } from "react";
import type { RegistryIssue, RegistryService, ServiceKind, Stack } from "garry-client";
import Link from "../lib/router";
import { client } from "../lib/client";
import styles from "./addService.module.css";

const KINDS: { kind: ServiceKind; label: string; hint: string; stack: string }[] = [
  { kind: "mfe-remote", label: "Microfrontend", hint: "exposes modules other frontends load", stack: "react + vite + module-federation-2" },
  { kind: "mfe-shell", label: "Shell", hint: "the host that loads the microfrontends", stack: "react + vite + module-federation-2" },
  { kind: "backend", label: "Backend", hint: "an API, its own database", stack: "node + fastify + postgres" },
];

const csv = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

/** Adds a service to the registry: catalog/<name>.yaml, which the agents read before they touch its repository. */
export default function AddService({ services, onAdded, onCancel }: { services: RegistryService[]; onAdded: (issues: RegistryIssue[]) => void; onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ServiceKind>("mfe-remote");
  const [repo, setRepo] = useState("");
  const [owner, setOwner] = useState("");
  const [stack, setStack] = useState("");
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [stackRef, setStackRef] = useState("");
  useEffect(() => {
    client.stacks().then((d) => setStacks(d.stacks), () => undefined);
  }, []);
  const [exposes, setExposes] = useState("");
  // "service:module" pairs this one uses
  const [uses, setUses] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offered = services.flatMap((s) => s.exposes.map((m) => `${s.name}:${m}`));
  const toggle = (k: string) =>
    setUses((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const submit = async () => {
    setBusy(true);
    setError(null);
    const consumes: Record<string, string[]> = {};
    for (const k of uses) {
      const i = k.indexOf(":");
      (consumes[k.slice(0, i)] ??= []).push(k.slice(i + 1));
    }
    try {
      const r = await client.addService({ name: name.trim(), kind, repo: repo.trim(), owner: owner.trim() || undefined, stack: stackRef ? undefined : stack.trim() || undefined, stackRef: stackRef || undefined, exposes: csv(exposes), consumes });
      onAdded(r.issues);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const ready = /^[a-z][a-z0-9-]*$/.test(name.trim()) && repo.trim() !== "" && !busy;
  const current = KINDS.find((k) => k.kind === kind)!;
  return (
    <form
      className={`card ${styles.form}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void submit();
      }}
    >
      <div className={styles.kinds} role="radiogroup" aria-label="Kind of service">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className={`${styles.kind} ${kind === k.kind ? styles.kindOn : ""}`} onClick={() => setKind(k.kind)}>
            <span className={styles.kindLabel}>{k.label}</span>
            <span className={styles.kindHint}>{k.hint}</span>
          </button>
        ))}
      </div>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className="eyebrow">Name</span>
          <input className="input mono" placeholder="checkout" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} autoFocus />
        </label>
        <label className={styles.field}>
          <span className="eyebrow">Repository</span>
          <input className="input mono" placeholder="git@github.com:acme/checkout.git" value={repo} onChange={(e) => setRepo(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className="eyebrow">Owner</span>
          <input className="input" placeholder="team-payments" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className="eyebrow">Stack</span>
          {stacks.length > 0 ? (
            <select className="select" value={stackRef} onChange={(e) => setStackRef(e.target.value)}>
              <option value="">Not one of our stacks</option>
              {stacks.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
          {!stackRef && <input className="input" placeholder={current.stack} value={stack} onChange={(e) => setStack(e.target.value)} />}
          {stacks.length === 0 && (
            <span className={styles.kindHint}>
              Or define one in <Link href="/stacks">Stacks</Link>.
            </span>
          )}
        </label>
        {kind !== "mfe-shell" && (
          <label className={`${styles.field} ${styles.wide}`}>
            <span className="eyebrow">{kind === "backend" ? "Endpoints it offers" : "Modules it exposes"}</span>
            <input className="input mono" placeholder={kind === "backend" ? "POST /orders, GET /orders/:id" : "./Checkout, ./CartSummary"} value={exposes} onChange={(e) => setExposes(e.target.value)} />
          </label>
        )}
      </div>

      {offered.length > 0 && (
        <div className={styles.uses}>
          <span className="eyebrow">Uses from other services</span>
          <div className={styles.chips}>
            {offered.map((k) => (
              <button key={k} type="button" className={`chip mono ${styles.useChip} ${uses.has(k) ? styles.useOn : ""}`} aria-pressed={uses.has(k)} onClick={() => toggle(k)}>
                {k.replace(":", " ")}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <button className="btn btnPrimary" type="submit" disabled={!ready}>
          {busy ? "Adding…" : "Add service"}
        </button>
        {onCancel && (
          <button className="btn btnGhost" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        {error && <span className="badge danger">{error}</span>}
      </div>
      <p className={styles.note}>
        New code? <code>garry scaffold</code> creates a microfrontend and adds it here, and <code>garry adopt</code> reads an existing one.
      </p>
    </form>
  );
}
