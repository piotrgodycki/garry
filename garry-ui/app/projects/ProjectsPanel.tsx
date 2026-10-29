import { useEffect, useRef, useState } from "react";
import { GarryError, type GarryProjects } from "garry-client";
import { client } from "../lib/client";
import styles from "./projects.module.css";
import ProjectMark from "./ProjectMark";

/**
 * Settings, Projects: make one, switch, export one to a .garry.json file,
 * import one, remove one (any, as long as one is left; a removed active one
 * hands over to another). On this computer only; a paired phone sees the list.
 */
export default function ProjectsPanel() {
  const [data, setData] = useState<GarryProjects | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
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

  const remove = (id: string, name: string, wasActive: boolean) =>
    run(`rm:${id}`, async () => {
      await client.removeGarryProject(id);
      setRemoving(null);
      // everything on screen belonged to the project that is gone
      if (wasActive) window.location.reload();
    }, `Removed ${name}`);

  if (!data) return <p className={styles.note}>Loading projects…</p>;
  const only = data.projects.length === 1;
  return (
    <div className={styles.list}>
      <p className={styles.note}>
        A project holds everything one product is made of: its services and contracts, features, stacks, routing, the architecture board, and the repositories agents work on with their push settings. Export one to a single .garry.json file (no tokens, no code; repositories as remotes) and import it on another computer.
      </p>
      {data.projects.map((p) => (
        <div key={p.id} className={styles.row} role="group" aria-label={`project ${p.name}`}>
          <span className={styles.avatar} aria-hidden="true">
            <ProjectMark project={p} />
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
            {!readOnly && (
              <button
                className="btn btnSm btnGhost"
                disabled={!!busy || only}
                title={only ? "the last project stays: make another one first" : undefined}
                aria-expanded={removing === p.id}
                onClick={() => setRemoving(removing === p.id ? null : p.id)}
              >
                Remove
              </button>
            )}
          </span>
          {removing === p.id && (
            <div className={styles.confirm} role="alertdialog" aria-label={`remove ${p.name}`}>
              <p className={styles.note}>
                <strong>Remove {p.name}?</strong> Its services and contracts, features, stacks, routing and architecture boards are deleted. {p.repos?.length ? `Its ${p.repos.length} repositor${p.repos.length === 1 ? "y leaves Build and stays" : "ies leave Build and stay"} on disk.` : "It has no repositories in Build."}
                {p.id === data.active && ` Garry switches to ${(data.projects.find((x) => x.id !== p.id && x.id === "default") ?? data.projects.find((x) => x.id !== p.id))?.name}.`} Export it first to keep a copy.
              </p>
              <span className={styles.rowActions}>
                <button className="btn btnSm btnDanger" disabled={!!busy} onClick={() => void remove(p.id, p.name, p.id === data.active)}>
                  {busy === `rm:${p.id}` ? "Removing…" : `Remove ${p.name}`}
                </button>
                <button className="btn btnSm btnGhost" disabled={!!busy} onClick={() => setRemoving(null)}>
                  Cancel
                </button>
              </span>
            </div>
          )}
        </div>
      ))}
      {readOnly ? (
        <p className={styles.note}>Projects are made, imported and exported on the computer running Garry.</p>
      ) : (
        <div className={styles.tools}>
          <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Name of a new project, e.g. Shop" aria-label="new project name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && void run("new", () => client.createGarryProject(name.trim()).then(() => setName("")), "Created")} />
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
