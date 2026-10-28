import { useEffect, useState } from "react";
import type { RegistryIssue, RegistryService, ServiceKind, ServiceKindInfo, Stack, StackTemplate } from "garry-client";
import Link from "../lib/router";
import { client } from "../lib/client";
import styles from "./addService.module.css";

const DATABASES = [
  { engine: "", label: "None" },
  { engine: "postgres", label: "PostgreSQL" },
  { engine: "mysql", label: "MySQL" },
  { engine: "mongodb", label: "MongoDB" },
  { engine: "sqlite", label: "SQLite" },
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
  const [kinds, setKinds] = useState<ServiceKindInfo[]>([]);
  const [templates, setTemplates] = useState<StackTemplate[]>([]);
  const [db, setDb] = useState("");
  useEffect(() => {
    client.stacks().then(
      (d) => {
        setStacks(d.stacks);
        setTemplates(d.templates ?? []);
      },
      () => undefined,
    );
    client.serviceKinds().then(setKinds, () => undefined);
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
      // a ready-made stack becomes one of yours first, so the service can point at it
      let ref = stackRef;
      if (ref.startsWith("template:")) {
        const t = templates.find((x) => `template:${x.name}` === ref)!;
        if (!stacks.some((x) => x.name === t.name)) await client.saveStack({ name: t.name, description: t.description, technologies: t.technologies });
        ref = t.name;
      }
      const r = await client.addService({
        name: name.trim(),
        kind,
        repo: repo.trim(),
        owner: owner.trim() || undefined,
        stack: ref ? undefined : stack.trim() || undefined,
        stackRef: ref || undefined,
        exposes: current?.exposes ? csv(exposes) : [],
        consumes,
        db: current?.db && db ? { engine: db } : null,
      });
      onAdded(r.issues);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const ready = /^[a-z][a-z0-9-]*$/.test(name.trim()) && repo.trim() !== "" && !busy;
  const current = kinds.find((k) => k.id === kind);
  // ready-made stacks for this kind that are not already one of yours
  const fitting = templates.filter((t) => t.kinds.includes(kind) && !stacks.some((x) => x.name === t.name));
  return (
    <form
      className={`card ${styles.form}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void submit();
      }}
    >
      {(["Frontend", "Backend"] as const).map((group) => (
        <div key={group} className={styles.kindGroup}>
          <span className="eyebrow">{group}</span>
          <div className={styles.kinds} role="radiogroup" aria-label={`${group} kinds`}>
            {kinds
              .filter((k) => k.group === group)
              .map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  className={`${styles.kind} ${kind === k.id ? styles.kindOn : ""}`}
                  onClick={() => {
                    setKind(k.id);
                    // a ready-made stack picked for another kind may not fit this one
                    if (stackRef.startsWith("template:")) setStackRef("");
                  }}
                >
                  <span className={styles.kindLabel}>{k.label}</span>
                  <span className={styles.kindHint}>{k.hint}</span>
                </button>
              ))}
          </div>
        </div>
      ))}

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
          <select className="select" value={stackRef} onChange={(e) => setStackRef(e.target.value)} aria-label="stack">
            {stacks.length > 0 && (
              <optgroup label="Our stacks">
                {stacks.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
            {fitting.length > 0 && (
              <optgroup label="Ready-made for this kind">
                {fitting.map((t) => (
                  <option key={t.name} value={`template:${t.name}`}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="">{stack.trim() ? `Another: ${stack.trim()}` : `Garry's default for this kind: ${current?.stack ?? "…"}`}</option>
          </select>
          {!stackRef && <input className="input" placeholder={`or type one, e.g. ${current?.stack ?? ""}`} value={stack} onChange={(e) => setStack(e.target.value)} aria-label="another stack" />}
          {stacks.length === 0 && (
            <span className={styles.kindHint}>
              Your own stacks live in <Link href="/stacks">Stacks</Link>.
            </span>
          )}
        </label>
        {current?.db && (
          <label className={styles.field}>
            <span className="eyebrow">Database it owns</span>
            <select className="select" value={db} onChange={(e) => setDb(e.target.value)} aria-label="database">
              {DATABASES.map((d) => (
                <option key={d.engine} value={d.engine}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {current?.exposes && (
          <label className={`${styles.field} ${styles.wide}`}>
            <span className="eyebrow">{current.exposes.label}</span>
            <input className="input mono" placeholder={current.exposes.placeholder} value={exposes} onChange={(e) => setExposes(e.target.value)} />
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
