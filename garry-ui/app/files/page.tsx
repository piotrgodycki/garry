import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { GarryError, type FileContent, type FileEntry, type Project, type TerminalInfo, type Thread } from "garry-client";
import { client } from "../lib/client";
import { Icon } from "../icons";
import styles from "./files.module.css";

// the editor and the terminal load only when they are first needed
const CodeEditor = lazy(() => import("../build/CodeEditor"));
const Terminal = lazy(() => import("./Terminal"));

/** A root as the Files tab names it: "registry", "project:<id>" or "thread:<id>". */
interface Root {
  key: string;
  label: string;
  group: "Garry" | "Repos" | "Work in progress";
  api: string;
}

const apiOf = (key: string) => (key === "registry" ? "/api/registry" : key.replace(/^project:/, "/api/projects/").replace(/^thread:/, "/api/threads/"));

interface Tab {
  path: string;
  file: FileContent;
  text: string;
  state: { kind: "idle" | "saving" | "saved" | "error" | "conflict"; message?: string };
}
const isDirty = (t: Tab) => t.file.content !== null && t.text !== t.file.content;

function Folder({ api, path, depth, open, onOpen, selected, version }: { api: string; path: string; depth: number; open: Set<string>; onOpen: (e: FileEntry) => void; selected: string | null; version: number }) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  useEffect(() => {
    client.listFiles(api, path).then(setEntries, () => setEntries([]));
  }, [api, path, version]);
  if (!entries) return <div className={styles.loading} style={{ paddingLeft: 14 + depth * 14 }}>…</div>;
  if (!entries.length && !depth) return <p className={styles.hint}>This folder is empty.</p>;
  return (
    <>
      {entries.map((e) => (
        <div key={e.path}>
          <button className={`${styles.entry} ${selected === e.path ? styles.selected : ""}`} style={{ paddingLeft: 14 + depth * 14 }} onClick={() => onOpen(e)} title={e.path} aria-expanded={e.type === "dir" ? open.has(e.path) : undefined}>
            <span className={styles.twisty}>{e.type === "dir" ? (open.has(e.path) ? "▾" : "▸") : ""}</span>
            {e.name}
          </button>
          {e.type === "dir" && open.has(e.path) && <Folder api={api} path={e.path} depth={depth + 1} open={open} onOpen={onOpen} selected={selected} version={version} />}
        </div>
      ))}
    </>
  );
}

/**
 * Files: the registry, your repos and the work in progress, as folders. Browse,
 * open files in tabs, edit them by hand and run commands in a terminal, on the
 * computer running Garry. While an agent works in a folder, its files are read only.
 */
export default function FilesPage() {
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [blocked, setBlocked] = useState(false);
  const rootKey = params.get("root") ?? "registry";
  const api = apiOf(rootKey);

  const roots = useMemo<Root[]>(
    () => [
      { key: "registry", label: "Registry", group: "Garry", api: "/api/registry" },
      ...projects.map((p): Root => ({ key: `project:${p.id}`, label: p.name, group: "Repos", api: `/api/projects/${p.id}` })),
      ...threads.map((t): Root => ({ key: `thread:${t.id}`, label: t.title, group: "Work in progress", api: `/api/threads/${t.id}` })),
    ],
    [projects, threads],
  );
  const running = rootKey.startsWith("thread:") && Boolean(threads.find((t) => `thread:${t.id}` === rootKey)?.running);

  // the roots, and whether the agent in the open one is still working
  useEffect(() => {
    let live = true;
    const load = () =>
      Promise.all([client.projects(), client.threads()]).then(
        ([p, t]) => live && (setProjects(p), setThreads(t)),
        () => undefined,
      );
    void load();
    const timer = window.setInterval(load, 4000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  // ---- explorer and editor tabs ----
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const tab = tabs.find((t) => t.path === active) ?? null;
  const patch = (path: string, f: (t: Tab) => Tab) => setTabs((cur) => cur.map((t) => (t.path === path ? f(t) : t)));

  const openFile = useCallback(
    async (path: string) => {
      setActive(path);
      try {
        const file = await client.readFile(api, path);
        setTabs((cur) => (cur.some((t) => t.path === path) ? cur : [...cur, { path, file, text: file.content ?? "", state: { kind: "idle" } }]));
      } catch (e) {
        if (e instanceof GarryError && e.status === 403) setBlocked(true);
      }
    },
    [api],
  );

  // a new root starts with nothing open; a path in the address opens with its folders
  useEffect(() => {
    setTabs([]);
    setActive(null);
    setOpen(new Set());
    client.listFiles(api).then(
      () => setBlocked(false),
      (e) => e instanceof GarryError && e.status === 403 && setBlocked(true),
    );
  }, [api]);
  const wanted = params.get("path");
  useEffect(() => {
    if (!wanted) return;
    const parts = wanted.split("/");
    setOpen((cur) => new Set([...cur, ...parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"))]));
    void openFile(wanted);
  }, [wanted, openFile]);

  // when the agent stops, what it wrote shows
  useEffect(() => {
    if (!running) setVersion((v) => v + 1);
  }, [running]);

  const choose = (e: FileEntry) => {
    if (e.type === "file") return void openFile(e.path);
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(e.path)) next.delete(e.path);
      else next.add(e.path);
      return next;
    });
  };

  const closeTab = (path: string) => {
    const t = tabs.find((x) => x.path === path);
    if (t && isDirty(t) && !window.confirm(`Discard your changes to ${path}?`)) return;
    const rest = tabs.filter((x) => x.path !== path);
    setTabs(rest);
    if (active === path) setActive(rest[rest.length - 1]?.path ?? null);
  };

  const reload = async (path: string) => {
    const file = await client.readFile(api, path);
    patch(path, (t) => ({ ...t, file, text: file.content ?? "", state: { kind: "idle" } }));
  };

  const save = async (path: string) => {
    const t = tabs.find((x) => x.path === path);
    if (!t || !isDirty(t) || running) return;
    patch(path, (x) => ({ ...x, state: { kind: "saving" } }));
    try {
      const file = await client.writeFile(api, path, t.text, t.file.sha);
      patch(path, (x) => ({ ...x, file, state: { kind: "saved" } }));
    } catch (e) {
      const conflict = e instanceof GarryError && e.status === 409;
      patch(path, (x) => ({ ...x, state: { kind: conflict ? "conflict" : "error", message: String((e as Error).message) } }));
    }
  };

  const pickRoot = (key: string) => {
    if (tabs.some(isDirty) && !window.confirm("Some files have unsaved changes. Leave them?")) return;
    setParams(key === "registry" ? {} : { root: key });
  };

  // ---- terminals ----
  const [terms, setTerms] = useState<TerminalInfo[]>([]);
  const [termOn, setTermOn] = useState(false);
  const [termActive, setTermActive] = useState<string | null>(null);
  const [termNote, setTermNote] = useState<string | null>(null);
  const shown = terms.filter((t) => t.root === rootKey);

  useEffect(() => {
    client.terminals().then(
      (r) => {
        setTerms(r.terminals.filter((t) => !t.exited));
        if (!r.enabled) setTermNote("The terminal is turned off on this computer (GARRY_TERMINAL=off).");
      },
      () => undefined,
    );
  }, []);
  const shownIds = shown.map((t) => t.id).join();
  useEffect(() => setTermActive((cur) => (cur && shownIds.split(",").includes(cur) ? cur : (shownIds.split(",")[0] || null))), [shownIds]);

  const newTerminal = async () => {
    setTermOn(true);
    try {
      const t = await client.openTerminal(rootKey);
      setTerms((cur) => [...cur, t]);
      setTermActive(t.id);
      setTermNote(null);
    } catch (e) {
      setTermNote(String((e as Error).message));
    }
  };
  const closeTerminal = (id: string) => {
    void client.closeTerminal(id).catch(() => undefined);
    setTerms((cur) => cur.filter((t) => t.id !== id));
  };
  const toggleTerminal = () => {
    if (!termOn && !shown.length && !termNote) void newTerminal();
    else setTermOn((v) => !v);
  };

  // Ctrl+` shows and hides the terminal, as in most editors
  const toggleRef = useRef(toggleTerminal);
  toggleRef.current = toggleTerminal;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        toggleRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // leaving with unsaved changes asks first
  useEffect(() => {
    const dirty = tabs.some(isDirty);
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [tabs]);

  if (blocked) {
    return (
      <main className={styles.page}>
        <p className={styles.blocked}>Files are opened and edited on the computer running Garry.</p>
      </main>
    );
  }

  const current = roots.find((r) => r.key === rootKey);
  const groups = (["Garry", "Repos", "Work in progress"] as const).map((g) => ({ g, items: roots.filter((r) => r.group === g) })).filter((x) => x.items.length);

  return (
    <main className={styles.page}>
      <div className={`${styles.ide} ${termOn ? styles.withTerminal : ""}`}>
        <aside className={styles.side}>
          <label className={styles.rootPick}>
            <span className={styles.sideTitle}>Explorer</span>
            <select className="select" value={rootKey} onChange={(e) => pickRoot(e.target.value)} aria-label="folder">
              {!current && <option value={rootKey}>{rootKey}</option>}
              {groups.map(({ g, items }) => (
                <optgroup key={g} label={g}>
                  {items.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <nav className={styles.tree} aria-label="files">
            <Folder api={api} path="" depth={0} open={open} onOpen={choose} selected={active} version={version} />
          </nav>
        </aside>

        <section className={styles.main}>
          <div className={styles.tabs} role="tablist" aria-label="open files">
            {tabs.map((t) => (
              <div key={t.path} className={`${styles.tab} ${t.path === active ? styles.tabOn : ""}`} role="tab" aria-selected={t.path === active}>
                <button className={styles.tabName} onClick={() => setActive(t.path)} title={t.path}>
                  {t.path.split("/").pop()}
                </button>
                <button className={styles.tabClose} onClick={() => closeTab(t.path)} aria-label={`close ${t.path}`} title={isDirty(t) ? "unsaved changes" : "close"}>
                  {isDirty(t) ? <span className={styles.dot} /> : Icon.close}
                </button>
              </div>
            ))}
            <span className={styles.tabsFill} />
            <button className={`btn btnSm btnGhost ${styles.termToggle}`} onClick={toggleTerminal} aria-pressed={termOn} title="Show or hide the terminal (Ctrl+`)">
              {Icon.terminal} Terminal
            </button>
          </div>

          {!tab ? (
            <div className={styles.welcome}>
              <p className={styles.welcomeTitle}>{current?.label ?? "Files"}</p>
              <p className={styles.hint}>Pick a file on the left to read it or change it by hand. Ctrl+` opens a terminal in this folder.</p>
            </div>
          ) : (
            <div className={styles.editor}>
              <div className={styles.bar}>
                <span className={styles.path}>{tab.path}</span>
                <span className={styles.status}>
                  {running ? (
                    <span className="badge run">Read only while the agent works</span>
                  ) : tab.state.kind === "saved" && !isDirty(tab) ? (
                    <span className="badge ok">Saved</span>
                  ) : tab.state.kind === "conflict" ? (
                    <>
                      <span className="badge danger">Changed on disk</span>
                      <button className="btn btnSm" onClick={() => void reload(tab.path)}>
                        Reload
                      </button>
                    </>
                  ) : tab.state.kind === "error" ? (
                    <span className="badge danger">{tab.state.message}</span>
                  ) : null}
                  {tab.file.content !== null && (
                    <>
                      <button className="btn btnSm btnGhost" disabled={!isDirty(tab)} onClick={() => patch(tab.path, (t) => ({ ...t, text: t.file.content ?? "" }))}>
                        Revert
                      </button>
                      <button className="btn btnSm btnPrimary" disabled={!isDirty(tab) || running || tab.state.kind === "saving"} onClick={() => void save(tab.path)}>
                        {tab.state.kind === "saving" ? "Saving…" : "Save"}
                      </button>
                    </>
                  )}
                </span>
              </div>
              {tab.file.content === null ? (
                <p className={styles.hint}>{tab.file.reason === "binary" ? "A binary file; it cannot be edited here." : "Too large to edit here (over 1 MB)."}</p>
              ) : (
                <div className={styles.code}>
                  <Suspense fallback={<p className={styles.hint}>Loading the editor…</p>}>
                    <CodeEditor key={`${api}:${tab.path}`} path={tab.path} value={tab.text} readOnly={running} onChange={(text) => patch(tab.path, (t) => ({ ...t, text }))} onSave={() => void save(tab.path)} />
                  </Suspense>
                </div>
              )}
            </div>
          )}
        </section>

        {termOn && (
          <section className={styles.terminal} aria-label="terminals">
            <div className={styles.termBar}>
              {shown.map((t, i) => (
                <div key={t.id} className={`${styles.termTab} ${t.id === termActive ? styles.termTabOn : ""}`}>
                  <button className={styles.tabName} onClick={() => setTermActive(t.id)}>
                    {t.shell.split("/").pop()} {i + 1}
                  </button>
                  <button className={styles.tabClose} onClick={() => closeTerminal(t.id)} aria-label={`close terminal ${i + 1}`}>
                    {Icon.close}
                  </button>
                </div>
              ))}
              <button className="btn btnSm btnGhost" onClick={() => void newTerminal()} disabled={Boolean(termNote?.includes("GARRY_TERMINAL"))}>
                + New terminal
              </button>
              <span className={styles.tabsFill} />
              <span className={styles.termWhere}>{current?.label}</span>
              <button className={styles.tabClose} onClick={() => setTermOn(false)} aria-label="hide the terminal">
                {Icon.close}
              </button>
            </div>
            <div className={styles.termBody}>
              {termNote ? (
                <p className={styles.hint}>{termNote}</p>
              ) : !shown.length ? (
                <p className={styles.hint}>No terminal in this folder yet.</p>
              ) : (
                <Suspense fallback={<p className={styles.hint}>Loading the terminal…</p>}>
                  {shown.map((t) => (
                    <Terminal key={t.id} id={t.id} active={t.id === termActive} onExit={() => setTerms((cur) => cur.map((x) => (x.id === t.id ? { ...x, exited: true } : x)))} />
                  ))}
                </Suspense>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
