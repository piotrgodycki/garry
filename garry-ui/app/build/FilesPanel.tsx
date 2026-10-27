import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { GarryError, type FileContent, type FileEntry } from "garry-client";
import { client } from "../lib/client";
import styles from "./files.module.css";

// the editor is only loaded when a file is opened
const CodeEditor = lazy(() => import("./CodeEditor"));

function Folder({ root, path, depth, open, onOpen, selected, version }: { root: string; path: string; depth: number; open: Set<string>; onOpen: (e: FileEntry) => void; selected: string | null; version: number }) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  useEffect(() => {
    client.listFiles(root, path).then(setEntries, () => setEntries([]));
  }, [root, path, version]);
  if (!entries) return <div className={styles.loading} style={{ paddingLeft: 12 + depth * 14 }}>…</div>;
  return (
    <>
      {entries.map((e) => (
        <div key={e.path}>
          <button
            className={`${styles.entry} ${selected === e.path ? styles.selected : ""}`}
            style={{ paddingLeft: 12 + depth * 14 }}
            onClick={() => onOpen(e)}
            title={e.path}
          >
            <span className={styles.icon}>{e.type === "dir" ? (open.has(e.path) ? "▾" : "▸") : ""}</span>
            {e.name}
          </button>
          {e.type === "dir" && open.has(e.path) && <Folder root={root} path={e.path} depth={depth + 1} open={open} onOpen={onOpen} selected={selected} version={version} />}
        </div>
      ))}
    </>
  );
}

/**
 * Files under one root (root is its API path: a thread's worktree, a project's
 * checkout, the registry): browse them and edit by hand, on this computer only.
 * While running, the editor is read only; a file changed on disk since it was
 * opened is not overwritten.
 */
export default function FilesPanel({ root, running = false, openPath = null, onSaved }: { root: string; running?: boolean; openPath?: { path: string; at: number } | null; onSaved?: () => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<FileContent | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error" | "conflict"; message?: string }>({ kind: "idle" });
  const [blocked, setBlocked] = useState(false);
  const [version, setVersion] = useState(0);

  const dirty = file?.content !== null && file !== null && text !== file.content;

  const load = useCallback(
    async (path: string) => {
      try {
        const f = await client.readFile(root, path);
        setFile(f);
        setText(f.content ?? "");
        setState({ kind: "idle" });
      } catch (e) {
        if (e instanceof GarryError && e.status === 403) setBlocked(true);
        else setState({ kind: "error", message: String((e as Error).message) });
      }
    },
    [root],
  );

  const choose = (e: FileEntry) => {
    if (e.type === "dir") {
      setOpen((cur) => {
        const next = new Set(cur);
        if (next.has(e.path)) next.delete(e.path);
        else next.add(e.path);
        return next;
      });
      return;
    }
    if (dirty && !window.confirm(`Discard your changes to ${file?.path}?`)) return;
    void load(e.path);
  };

  // a file picked from Changes: open its folders and the file
  useEffect(() => {
    if (!openPath) return;
    const parts = openPath.path.split("/");
    setOpen((cur) => new Set([...cur, ...parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"))]));
    void load(openPath.path);
  }, [openPath, load]);

  useEffect(() => {
    setFile(null);
    setOpen(new Set());
    client.listFiles(root).then(
      () => setBlocked(false),
      (e) => e instanceof GarryError && e.status === 403 && setBlocked(true),
    );
  }, [root]);

  // when the agent finishes a turn, the tree may have changed
  useEffect(() => {
    if (!running) setVersion((v) => v + 1);
  }, [running]);

  const save = async () => {
    if (!file || file.content === null || running || !dirty) return;
    setState({ kind: "saving" });
    try {
      const f = await client.writeFile(root, file.path, text, file.sha);
      setFile(f);
      setState({ kind: "saved" });
      onSaved?.();
    } catch (e) {
      const conflict = e instanceof GarryError && e.status === 409;
      setState({ kind: conflict ? "conflict" : "error", message: String((e as Error).message) });
    }
  };

  if (blocked) {
    return <p className={styles.blocked}>Files are opened and edited on the computer running Garry.</p>;
  }

  return (
    <div className={styles.panel}>
      <nav className={styles.tree} aria-label="files">
        <Folder root={root} path="" depth={0} open={open} onOpen={choose} selected={file?.path ?? null} version={version} />
      </nav>
      <div className={styles.editor}>
        {!file ? (
          <p className={styles.empty}>Pick a file to read it, or to change it by hand.</p>
        ) : (
          <>
            <div className={styles.bar}>
              <span className={styles.path}>
                {file.path}
                {dirty && <span className={styles.dot} title="unsaved changes" />}
              </span>
              <span className={styles.status}>
                {running ? (
                  <span className="badge run">Read only while the agent works</span>
                ) : state.kind === "saved" && !dirty ? (
                  <span className="badge ok">Saved</span>
                ) : state.kind === "conflict" ? (
                  <>
                    <span className="badge danger">Changed on disk</span>
                    <button className="btn btnSm" onClick={() => void load(file.path)}>
                      Reload
                    </button>
                  </>
                ) : state.kind === "error" ? (
                  <span className="badge danger">{state.message}</span>
                ) : null}
                {file.content !== null && (
                  <>
                    <button className="btn btnSm btnGhost" disabled={!dirty} onClick={() => setText(file.content ?? "")}>
                      Revert
                    </button>
                    <button className="btn btnSm btnPrimary" disabled={!dirty || running || state.kind === "saving"} onClick={() => void save()}>
                      {state.kind === "saving" ? "Saving…" : "Save"}
                    </button>
                  </>
                )}
              </span>
            </div>
            {file.content === null ? (
              <p className={styles.empty}>{file.reason === "binary" ? "A binary file; it cannot be edited here." : "Too large to edit here (over 1 MB)."}</p>
            ) : (
              <div className={styles.code}>
                <Suspense fallback={<p className={styles.empty}>Loading the editor…</p>}>
                  <CodeEditor path={file.path} value={text} readOnly={running} onChange={setText} onSave={() => void save()} />
                </Suspense>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
