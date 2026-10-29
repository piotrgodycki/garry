import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { Chain, GarryProject, Pair, Project, Thread } from "garry-client";
import Link from "../lib/router";
import { client } from "../lib/client";
import { PageHeader, ServerNotice, Skeleton } from "../ui";
import { Icon } from "../icons";
import styles from "./jobs.module.css";
import GithubImport from "./GithubImport";
import AgentView from "../agent/page";
import Illustrated from "../Illustrations";
import NewJob from "./NewJob";
import Jobs from "./Jobs";

/**
 * Build: give agents jobs in the project's repositories and follow every job
 * to a pull request. Adding a repository and the feature pipeline are a
 * button away in the header; Live shows the agents as they work.
 */
export default function Build() {
  const [params] = useSearchParams();
  if (params.get("view") === "pipeline")
    return (
      <main className="page">
        <PageHeader back={{ href: "/build", label: "Build" }} title="Feature pipeline" lede="How a feature moves through spec, plan, design, build, review, test and release, and which agent and model does each stage for every service." />
        <AgentView embedded />
      </main>
    );
  return <Work task={params.get("task") ?? ""} />;
}

function Work({ task }: { task: string }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [teams, setTeams] = useState<{ pairs: Pair[]; chains: Chain[] }>({ pairs: [], chains: [] });
  const [offline, setOffline] = useState(false);
  const [adding, setAdding] = useState(false);
  // repositories an imported project names that are not cloned here yet
  const [garry, setGarry] = useState<GarryProject | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([client.projects(), client.threads(), client.teams().catch(() => ({ pairs: [], chains: [] }))])
        .then(([p, t, tm]) => {
          setProjects(p);
          setThreads(t);
          setTeams(tm);
          setOffline(false);
        })
        .catch(() => setOffline(true)),
    [],
  );
  const loadGarry = () => client.garryProjects().then((g) => setGarry(g.projects.find((p) => p.id === g.active) ?? null), () => undefined);
  useEffect(() => {
    void load();
    void loadGarry();
    // often enough that what each agent is doing reads as live
    const timer = setInterval(load, 2500);
    return () => clearInterval(timer);
  }, [load]);

  const clone = async (remote: string) => {
    if (!garry) return;
    setCloning(remote);
    setError(null);
    try {
      await client.clonePendingRepo(garry.id, remote);
      await Promise.all([load(), loadGarry()]);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setCloning(null);
    }
  };

  const none = projects?.length === 0;
  return (
    <main className="page">
      <PageHeader
        title="Build"
        lede="Give an agent a job in one of your repositories. It works on its own branch, so nothing changes until you review it, commit it and open a pull request."
        actions={
          <>
            <button className="btn" aria-expanded={adding || none} onClick={() => setAdding(!adding)}>
              {Icon.github}
              Add a repository
            </button>
            <Link className="btn btnGhost" href="/build?view=pipeline">
              Feature pipeline
            </Link>
          </>
        }
      />
      {offline && <ServerNotice />}

      {(adding || none) && (
        <section className={`card ${styles.addRepo}`} aria-labelledby="add-repo">
          <h2 id="add-repo" className={styles.cardTitle}>
            Add a repository
          </h2>
          <p className={styles.help}>
            Import one from GitHub below. A repository already on this computer: run <code>garry repos add &lt;folder&gt;</code>, or start <code>garry serve</code> inside it.
          </p>
          <GithubImport
            onImported={() => {
              setAdding(false);
              void load();
            }}
          />
        </section>
      )}

      {garry?.pendingRepos?.length ? (
        <section className={`card ${styles.addRepo}`} aria-labelledby="to-clone">
          <h2 id="to-clone" className={styles.cardTitle}>
            To clone, from the imported project {garry.name}
          </h2>
          {garry.pendingRepos.map((r) => (
            <div key={r.remote} className={styles.cloneRow}>
              <b>{r.name}</b>
              <span className={styles.help}>{r.remote}</span>
              <button className="btn btnSm" disabled={!!cloning} onClick={() => void clone(r.remote)}>
                {cloning === r.remote ? "Cloning…" : "Clone"}
              </button>
            </div>
          ))}
          {error && <span className="badge danger">{error}</span>}
        </section>
      ) : null}

      {projects === null ? (
        <Skeleton rows={2} height={120} />
      ) : none ? (
        <Illustrated art="connectRepo" title="Add your first repository">
          Agents work in your repositories. Add one above, and then give an agent its first job.
        </Illustrated>
      ) : (
        <div className={styles.layout}>
          <NewJob key={projects.map((p) => p.id).join()} projects={projects} task={task} onStarted={() => void load()} />
          <Jobs threads={threads} teams={teams} projects={projects} onChange={() => void load()} />
        </div>
      )}
    </main>
  );
}
