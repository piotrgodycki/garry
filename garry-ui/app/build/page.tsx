import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { GarryProject, Project, Thread } from "garry-client";
import Link from "../lib/router";
import { client } from "../lib/client";
import { confirmAction } from "../lib/desktop";
import { Empty, PageHeader, ServerNotice, Skeleton } from "../ui";
import { Icon } from "../icons";
import styles from "./build.module.css";
import GithubImport from "./GithubImport";
import ProjectSettingsPanel from "./ProjectSettings";
import Select from "../Select";
import AgentsNow from "./AgentsNow";
import AgentView from "../agent/page";

const badge = (t: Thread) => (t.running || t.status === "running" ? "run" : t.attention === "needs-you" ? "danger" : t.pr ? "ok" : "");
const label = (t: Thread) => (t.running || t.status === "running" ? "Working" : t.attention === "needs-you" ? (t.status === "error" ? "Stopped" : "Needs you") : t.pr ? "PR open" : t.commit ? "Committed" : "Ready for review");

/** Start work in a project and follow every piece of work in progress. */
export default function Build() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const pipeline = params.get("view") === "pipeline";
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [projectId, setProjectId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [importing, setImporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // repositories an imported project names that are not cloned here yet
  const [garry, setGarry] = useState<GarryProject | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const loadGarry = () => client.garryProjects().then((g) => setGarry(g.projects.find((p) => p.id === g.active) ?? null), () => undefined);
  useEffect(() => void loadGarry(), []);
  const clone = async (remote: string) => {
    if (!garry) return;
    setCloning(remote);
    setError(null);
    try {
      const p = await client.clonePendingRepo(garry.id, remote);
      setProjects((cur) => [...(cur ?? []).filter((x) => x.id !== p.id), p]);
      setProjectId(p.id);
      await loadGarry();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setCloning(null);
    }
  };

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
    // often enough that what each agent is doing reads as live
    const timer = setInterval(load, 2500);
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
      <PageHeader title="Build with agents" lede="Describe the change. An agent works on it in its own branch; you review the diff, commit and open the pull request. Every agent's work shows here, live." />
      {offline && <ServerNotice />}

      <AgentsNow threads={threads} projects={projects ?? []} />

      <div className={styles.views} role="tablist" aria-label="view">
        <button role="tab" aria-selected={!pipeline} className={`${styles.view} ${!pipeline ? styles.viewOn : ""}`} onClick={() => setParams({})}>
          Work
        </button>
        <button role="tab" aria-selected={pipeline} className={`${styles.view} ${pipeline ? styles.viewOn : ""}`} onClick={() => setParams({ view: "pipeline" })}>
          Feature pipeline
        </button>
      </div>

      {pipeline ? (
        <AgentView embedded />
      ) : (
        <>

      <section className={`card ${styles.newForm}`}>
        {projects === null ? (
          <Skeleton />
        ) : projects.length === 0 ? (
          <Empty>No repositories in this project yet. Import one from GitHub below, run garry serve inside a git repository, or garry repos add &lt;path&gt;.</Empty>
        ) : (
          <>
            <div className={styles.repoBar}>
              <span className="eyebrow">Works in</span>
              {projects.length > 1 ? (
                <Select id="project" ariaLabel="repository" value={projectId} onChange={setProjectId} options={projects.map((p) => ({ value: p.id, label: p.name, hint: p.path }))} />
              ) : (
                <span className={styles.repoName} title={projects[0]?.path}>
                  {projects[0]?.name}
                </span>
              )}
              <button
                className={`${styles.gear} ${settingsOpen ? styles.gearOn : ""}`}
                aria-expanded={settingsOpen}
                aria-label="push and branch settings for this repository"
                title="Push and branch settings"
                onClick={() => setSettingsOpen((v) => !v)}
              >
                {Icon.settings}
              </button>
            </div>
            {settingsOpen && projectId && <ProjectSettingsPanel projectId={projectId} />}
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

      {garry?.pendingRepos?.length ? (
        <section className={`card ${styles.newForm}`} style={{ marginTop: 16 }}>
          <span className="eyebrow">To clone · from the imported project {garry.name}</span>
          {garry.pendingRepos.map((r) => (
            <div key={r.remote} className={styles.repo}>
              <span className={styles.itemTitle}>{r.name}</span>
              <button className="btn" disabled={!!cloning} onClick={() => void clone(r.remote)}>
                {cloning === r.remote ? "Cloning…" : "Clone"}
              </button>
              <span className={styles.meta}>{r.remote}</span>
            </div>
          ))}
        </section>
      ) : null}

      <div className={styles.row} style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => setImporting((v) => !v)} aria-expanded={importing || projects?.length === 0}>
          {importing || projects?.length === 0 ? "Hide GitHub" : "Import from GitHub"}
        </button>
      </div>
      {(importing || projects?.length === 0) && (
        <section className="card" style={{ marginTop: 12 }}>
          <GithubImport
            onImported={(p) => {
              setProjects((cur) => [...(cur ?? []).filter((x) => x.id !== p.id), p]);
              setProjectId(p.id);
              setImporting(false);
            }}
          />
        </section>
      )}

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
        </>
      )}
    </main>
  );
}
