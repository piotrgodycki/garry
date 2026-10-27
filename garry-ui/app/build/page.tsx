import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Project, Thread } from "garry-client";
import Link from "../lib/router";
import { client } from "../lib/client";
import { confirmAction } from "../lib/desktop";
import { Empty, PageHeader, ServerNotice, Skeleton } from "../ui";
import styles from "./build.module.css";
import FilesPanel from "./FilesPanel";

const badge = (t: Thread) => (t.running || t.status === "running" ? "run" : t.status === "error" ? "danger" : t.pr ? "ok" : "");
const label = (t: Thread) => (t.running || t.status === "running" ? "Working" : t.status === "error" ? "Stopped" : t.pr ? "PR open" : t.commit ? "Committed" : "Ready for review");

/** Start work in a project and follow every piece of work in progress. */
export default function Build() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [projectId, setProjectId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const load = () =>
      Promise.all([client.projects(), client.threads()])
        .then(([p, t]) => {
          setProjects(p);
          setThreads(t);
          setProjectId((cur) => cur || p[0]?.id || "");
          setOffline(false);
        })
        .catch(() => setOffline(true));
    void load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const start = async () => {
    if (!(await confirmAction("start new work in Garry"))) return;
    setBusy(true);
    setError(null);
    try {
      const t = await client.createThread(projectId, prompt);
      navigate(`/build/${t.id}`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const names = new Map((projects ?? []).map((p) => [p.id, p.name]));
  return (
    <main className="page">
      <PageHeader eyebrow="Build" title="Build with agents" lede="Describe the change. An agent works on it in its own branch; you review the diff, commit and open the pull request." />
      {offline && <ServerNotice />}

      <section className={`card ${styles.newForm}`}>
        {projects === null ? (
          <Skeleton />
        ) : projects.length === 0 ? (
          <Empty>No projects yet. Run garry serve inside a git repository, or garry projects add &lt;path&gt;.</Empty>
        ) : (
          <>
            <div className={styles.row}>
              <label className="eyebrow" htmlFor="project">
                Project
              </label>
              <select id="project" className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className={`input ${styles.prompt}`}
              placeholder="What should change? For example: add a dark mode toggle to the settings page."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && prompt.trim() && !busy) void start();
              }}
            />
            <div className={styles.row}>
              <button className="btn btnPrimary" disabled={!prompt.trim() || !projectId || busy} onClick={() => void start()}>
                {busy ? "Starting…" : "Start"}
              </button>
              {error && <span className="badge danger">{error}</span>}
            </div>
          </>
        )}
      </section>

      <h2 className="eyebrow" style={{ marginTop: 28 }}>
        Work
      </h2>
      {threads.length === 0 ? (
        <Empty>Nothing in progress.</Empty>
      ) : (
        <div className={styles.list}>
          {threads.map((t) => (
            <Link key={t.id} href={`/build/${t.id}`} className={`card ${styles.item}`}>
              <span className={styles.itemTitle}>{t.title}</span>
              <span className={`badge ${badge(t)}`}>{label(t)}</span>
              <span className={styles.meta}>
                {names.get(t.projectId) ?? t.projectId} · {t.branch}
              </span>
              <span className={styles.meta}>{new Date(t.updatedAt).toLocaleString()}</span>
            </Link>
          ))}
        </div>
      )}

      {projectId && (
        <>
          <h2 className="eyebrow" style={{ marginTop: 28 }}>
            Files · {names.get(projectId) ?? projectId} · this computer only
          </h2>
          <section className="card" style={{ padding: 0 }}>
            <p className={styles.filesNote}>
              The project&apos;s own checkout. Agents never work here (each piece of work has its own branch), so what you change by hand stays yours to commit.
            </p>
            <FilesPanel root={`/api/projects/${projectId}`} />
          </section>
        </>
      )}
    </main>
  );
}
