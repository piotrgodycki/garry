import { useEffect, useMemo, useState } from "react";
import type { CatalogTech, Stack, StackIssue, StackTemplate, Stacks as StacksData } from "garry-client";
import Link from "../lib/router";
import { client } from "../lib/client";
import { Empty, PageHeader, ServerNotice, Skeleton } from "../ui";
import styles from "./stacks.module.css";

function Issues({ issues }: { issues: StackIssue[] }) {
  const shown = issues.filter((i) => i.level !== "info");
  if (!shown.length) return null;
  return (
    <ul className={styles.issues}>
      {shown.map((i) => (
        <li key={i.message}>
          <span className={`badge ${i.level === "error" ? "danger" : "warn"}`}>{i.level === "error" ? "conflict" : "check"}</span> {i.message}
        </li>
      ))}
    </ul>
  );
}

/** Build or change a stack: pick technologies from the catalog, pin versions, see what does not fit. */
function Composer({ data, initial, template, onSaved, onCancel }: { data: StacksData; initial: Stack | null; template?: StackTemplate; onSaved: () => void; onCancel: () => void }) {
  const start = initial ?? (template ? { name: template.name, description: template.description, technologies: template.technologies } : null);
  const [name, setName] = useState(start?.name ?? "");
  const [description, setDescription] = useState(start?.description ?? "");
  const [picked, setPicked] = useState<Stack["technologies"]>(start?.technologies ?? []);
  const [query, setQuery] = useState("");
  const [issues, setIssues] = useState<StackIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(data.catalog.map((t) => [t.id, t])), [data.catalog]);
  const ids = picked.map((t) => t.id);
  const has = new Set(ids);

  // the server holds the rules; ask it whenever the picks change
  useEffect(() => {
    if (!ids.length) return setIssues([]);
    const timer = setTimeout(() => void client.checkStack(ids).then(setIssues, () => undefined), 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join()]);

  const clashes = (t: CatalogTech) => !has.has(t.id) && ids.some((id) => t.conflicts?.includes(id) || byId.get(id)?.conflicts?.includes(t.id));
  const toggle = (t: CatalogTech) => setPicked((cur) => (cur.some((p) => p.id === t.id) ? cur.filter((p) => p.id !== t.id) : [...cur, { id: t.id }]));
  const q = query.trim().toLowerCase();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.saveStack({ name: name.trim(), description: description.trim() || undefined, technologies: picked }, Boolean(initial));
      onSaved();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`card ${styles.composer}`}>
      <div className={styles.head}>
        <label className={styles.field}>
          <span className="eyebrow">Name</span>
          <input className="input mono" placeholder="web-frontend" value={name} disabled={Boolean(initial)} onChange={(e) => setName(e.target.value.toLowerCase())} autoFocus={!initial} />
        </label>
        <label className={`${styles.field} ${styles.grow}`}>
          <span className="eyebrow">What it is for</span>
          <input className="input" placeholder="Our microfrontends: React, Vite, Module Federation" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>

      <div className={styles.picked}>
        <span className="eyebrow">The stack · {picked.length}</span>
        {picked.length === 0 ? (
          <p className="muted">Pick technologies below.</p>
        ) : (
          <div className={styles.pickedList}>
            {picked.map((p) => (
              <span key={p.id} className={`${styles.pick} ${issues.some((i) => i.tech === p.id && i.level === "error") ? styles.pickBad : ""}`}>
                <span>{byId.get(p.id)?.name ?? p.id}</span>
                <input
                  className={styles.version}
                  placeholder="version"
                  aria-label={`${p.id} version`}
                  value={p.version ?? ""}
                  onChange={(e) => setPicked((cur) => cur.map((c) => (c.id === p.id ? { ...c, version: e.target.value } : c)))}
                />
                <button className={styles.remove} aria-label={`remove ${p.id}`} onClick={() => setPicked((cur) => cur.filter((c) => c.id !== p.id))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <Issues issues={issues} />
      </div>

      <input className="input" aria-label="search the catalog" placeholder="Search the catalog: postgres, workers, tailwind…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className={styles.catalog}>
        {data.categories.map((c) => {
          const techs = data.catalog.filter((t) => t.category === c.id && (!q || t.name.toLowerCase().includes(q) || t.id.includes(q)));
          if (!techs.length) return null;
          return (
            <div key={c.id} className={styles.category}>
              <span className={styles.catLabel}>
                {c.label}
                {c.single && <span className="muted"> · one</span>}
              </span>
              <div className={styles.chips}>
                {techs.map((t) => (
                  <button
                    key={t.id}
                    className={`chip ${styles.tech} ${has.has(t.id) ? styles.on : ""} ${clashes(t) ? styles.clash : ""}`}
                    aria-pressed={has.has(t.id)}
                    title={t.note ?? (clashes(t) ? "does not work with something you picked" : undefined)}
                    onClick={() => toggle(t)}
                  >
                    {t.name}
                    {t.side && <span className={styles.side}>{t.side}</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.actions}>
        <button className="btn btnPrimary" disabled={!name.trim() || !picked.length || busy} onClick={() => void save()}>
          {busy ? "Saving…" : initial ? "Save stack" : "Create stack"}
        </button>
        <button className="btn btnGhost" onClick={onCancel}>
          Cancel
        </button>
        {error && <span className="badge danger">{error}</span>}
      </div>
    </section>
  );
}

export default function Stacks() {
  const [data, setData] = useState<StacksData | null>(null);
  const [offline, setOffline] = useState(false);
  const [editing, setEditing] = useState<Stack | "new" | null>(null);
  const [fromTemplate, setFromTemplate] = useState<StackTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    client.stacks().then(
      (d) => {
        setData(d);
        setOffline(false);
      },
      () => setOffline(true),
    );
  useEffect(() => {
    void load();
  }, []);

  const names = useMemo(() => new Map((data?.catalog ?? []).map((t) => [t.id, t.name])), [data]);
  const remove = async (name: string) => {
    if (!window.confirm(`Remove the stack ${name}?`)) return;
    setError(null);
    try {
      await client.removeStack(name);
      await load();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  return (
    <main className="page">
      <PageHeader
        eyebrow="Configure"
        title="Tech stacks"
        lede="The technologies your services are built with. Compose a stack from the catalog, and Garry tells you what does not fit; services point at a stack, and their agents work in it."
        actions={
          data &&
          !editing && (
            <button
              className="btn btnPrimary"
              onClick={() => {
                setFromTemplate(null);
                setEditing("new");
              }}
            >
              New stack
            </button>
          )
        }
      />
      {offline && <ServerNotice />}
      {!data && !offline && <Skeleton rows={2} height={140} />}
      {data && editing && (
        <Composer
          key={editing === "new" ? `new:${fromTemplate?.name ?? ""}` : editing.name}
          data={data}
          initial={editing === "new" ? null : editing}
          template={editing === "new" ? (fromTemplate ?? undefined) : undefined}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {error && <p className="badge danger">{error}</p>}
      {data && data.stacks.length === 0 && !editing && <Empty>No stacks yet. Start from a ready-made one below, or create your own.</Empty>}
      {data && data.stacks.length > 0 && (
        <div className={styles.grid}>
          {data.stacks.map((s) => (
            <article key={s.name} className={`card ${styles.stack}`}>
              <div className={styles.stackHead}>
                <span className={styles.stackName}>{s.name}</span>
                <span className={styles.stackActions}>
                  <button className="btn btnSm" onClick={() => setEditing(s)}>
                    Edit
                  </button>
                  <button className="btn btnSm btnGhost" onClick={() => void remove(s.name)}>
                    Remove
                  </button>
                </span>
              </div>
              {s.description && <p className={styles.desc}>{s.description}</p>}
              <div className={styles.chips}>
                {s.technologies.map((t) => (
                  <span key={t.id} className="chip">
                    {names.get(t.id) ?? t.id}
                    {t.version && <span className="muted"> {t.version}</span>}
                  </span>
                ))}
              </div>
              <Issues issues={s.issues} />
              <p className={styles.used}>
                {s.usedBy.length ? (
                  <>
                    Used by{" "}
                    {s.usedBy.map((u, i) => (
                      <span key={u}>
                        {i > 0 && ", "}
                        <Link href={`/service/${u}`}>{u}</Link>
                      </span>
                    ))}
                  </>
                ) : (
                  <span className="muted">No service uses it yet. Pick it when you add a service in the registry.</span>
                )}
              </p>
            </article>
          ))}
        </div>
      )}
      {data && !editing && (
        <section className="section" aria-labelledby="ready-made">
          <div className="sectionHead">
            <h2 id="ready-made">Ready-made stacks</h2>
            <span className="count">well known combinations to start from, then change</span>
          </div>
          <div className={styles.grid}>
            {(data.templates ?? []).map((t) => {
              const taken = data.stacks.some((s) => s.name === t.name);
              return (
                <article key={t.name} className={`card ${styles.stack}`}>
                  <div className={styles.stackHead}>
                    <span className={styles.stackName}>{t.title}</span>
                    <span className={styles.stackActions}>
                      <button
                        className="btn btnSm"
                        disabled={taken}
                        title={taken ? "you already have a stack with this name" : undefined}
                        onClick={() => {
                          setFromTemplate(t);
                          setEditing("new");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        {taken ? "Added" : "Use this"}
                      </button>
                    </span>
                  </div>
                  <p className={styles.desc}>{t.description}</p>
                  <div className={styles.chips}>
                    {t.technologies.map((x) => (
                      <span key={x.id} className="chip">
                        {names.get(x.id) ?? x.id}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
