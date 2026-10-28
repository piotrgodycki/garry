import { useEffect, useRef, useState } from "react";
import { GarryError, type GarryProjects } from "garry-client";
import { client } from "../lib/client";
import styles from "./projects.module.css";

/**
 * Settings, Projects: make one, switch, export one to a .garry.json file and
 * import one. On this computer only; a paired phone sees the list.
 */
export default function ProjectsPanel() {
  const [data, setData] = useState<GarryProjects | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const load = () => client.garryProjects().then(setData, (e) => setNote({ ok: false, text: String((e as Error).message ?? e) }));
  useEffect(() => void load(), []);

  const run = async (what: string, f: () => Promise<unknown>, done?: string) => {
    setBusy(what);
    setNote(null);
    try {
      await f();
      await load();
      if (done) setNote({ ok: true, text: done });
    } catch (e) {
      if (e instanceof GarryError && e.status === 403) setReadOnly(true);
      setNote({ ok: false, text: String((e as Error).message ?? e) });
    } finally {
      setBusy(null);
    }
  };

  const download = (id: string) =>
    run(`export:${id}`, async () => {
      const bundle = await client.exportGarryProject(id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `${id}.garry.json` });
      a.click();
      URL.revokeObjectURL(url);
    });

  const importFile = (f: File) =>
    run(
      "import",
      async () => {
        let bundle: unknown;
        try {
          bundle = JSON.parse(await f.text());
        } catch {
          throw new Error("that file is not a Garry project (.garry.json)");
        }
        const p = await client.importGarryProject(bundle);
        setNote({ ok: true, text: `Imported ${p.name}` });
      },
    ).finally(() => file.current && (file.current.value = ""));

  if (!data) return <p className={styles.note}>Loading projects…</p>;
  return (
    <div className={styles.list}>
      <p className={styles.note}>
        A project holds everything one product is made of: its services and contracts, features, stacks, routing, the architecture board, and the repositories agents work on with their push settings. Export one to a single .garry.json file (no tokens, no code; repositories as remotes) and import it on another computer.
      </p>
      {data.projects.map((p) => (
        <div key={p.id} className={styles.row}>
          <span className={styles.avatar} aria-hidden="true">
            {p.name.slice(0, 1).toUpperCase()}
          </span>
          <span className={styles.currentText}>
            <span className={styles.currentName}>
              {p.name} {p.id === data.active && <span className="badge ok">In use</span>}
            </span>
            <span className={styles.currentLabel}>
              {p.repos?.length ?? 0} repo{p.repos?.length === 1 ? "" : "s"}
              {p.pendingRepos?.length ? ` · ${p.pendingRepos.length} to clone (Build)` : ""}
              {p.description ? ` · ${p.description}` : ""}
            </span>
          </span>
          <span className={styles.rowActions}>
            {p.id !== data.active && !readOnly && (
              <button className="btn btnSm" disabled={!!busy} onClick={() => void run(`use:${p.id}`, () => client.useGarryProject(p.id).then(() => window.location.reload()))}>
                Use
              </button>
            )}
            {!readOnly && (
              <button className="btn btnSm btnGhost" disabled={!!busy} onClick={() => void download(p.id)}>
                {busy === `export:${p.id}` ? "Exporting…" : "Export"}
              </button>
            )}
            {!readOnly && p.id !== "default" && p.id !== data.active && (
              <button
                className="btn btnSm btnGhost"
                disabled={!!busy}
                onClick={() => window.confirm(`Remove ${p.name}? Its registry folder is deleted; cloned repositories stay on disk.`) && void run(`rm:${p.id}`, () => client.removeGarryProject(p.id))}
              >
                Remove
              </button>
            )}
          </span>
        </div>
      ))}
      {readOnly ? (
        <p className={styles.note}>Projects are made, imported and exported on the computer running Garry.</p>
      ) : (
        <div className={styles.tools}>
          <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="New project name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && void run("new", () => client.createGarryProject(name.trim()).then(() => setName("")), "Created")} />
          <button className="btn btnPrimary" disabled={!name.trim() || !!busy} onClick={() => void run("new", () => client.createGarryProject(name.trim()).then(() => setName("")), "Created")}>
            New project
          </button>
          <button className="btn" disabled={!!busy} onClick={() => file.current?.click()}>
            {busy === "import" ? "Importing…" : "Import .garry.json"}
          </button>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
        </div>
      )}
      {note && <span className={`badge ${note.ok ? "ok" : "danger"}`}>{note.text}</span>}
    </div>
  );
}
