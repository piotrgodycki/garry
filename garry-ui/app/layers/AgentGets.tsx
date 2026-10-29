import { useEffect, useState } from "react";
import type { AgentContext } from "garry-client";
import { client } from "../lib/client";
import Select from "../Select";
import styles from "./layers.module.css";

const where = (f: string) => (f === "everywhere" ? "every project" : f === "project" ? "project" : f.startsWith("repo:") ? "repository" : `service ${f.slice(8)}`);

/** What an agent in one repository ends up with, every layer added up. */
export default function AgentGets({ repos, prefer, version }: { repos: { id: string; name: string }[]; prefer: string | null; version: number }) {
  const [repoId, setRepoId] = useState(repos[0]?.id ?? "");
  const [ctx, setCtx] = useState<AgentContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  // follow the layer being changed: its repository is the one worth looking at
  useEffect(() => {
    const r = repos.find((x) => x.name === prefer);
    if (r) setRepoId(r.id);
  }, [prefer, repos]);
  useEffect(() => {
    if (!repoId) return;
    client.agentContext(repoId).then(
      (c) => (setCtx(c), setError(null)),
      (e: Error) => setError(e.message),
    );
  }, [repoId, version]);

  return (
    <aside className={`card ${styles.gets}`} aria-labelledby="agent-gets">
      <h2 id="agent-gets" className={styles.title}>
        What an agent gets
      </h2>
      {repos.length === 0 ? (
        <p className={styles.help}>Add a repository in Build to see what its agents get.</p>
      ) : (
        <>
          <label className={styles.inline}>
            <span className={styles.help}>Working in</span>
            <Select ariaLabel="repository the agent works in" value={repoId} onChange={setRepoId} options={repos.map((r) => ({ value: r.id, label: r.name }))} />
          </label>
          {error && <span className="badge danger">{error}</span>}
          {ctx && (
            <div className={styles.getsBody}>
              <section aria-label="skills it gets">
                <h3>Skills</h3>
                {ctx.skills.length ? (
                  <ul className={styles.got}>
                    {ctx.skills.map((s) => (
                      <li key={s.name}>
                        <b>{s.name}</b>
                        <span className={styles.from}>{where(s.from)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.help}>None.</p>
                )}
                {ctx.missing.length > 0 && <span className="badge warn">Turned on but not installed: {ctx.missing.join(", ")}</span>}
              </section>
              <section aria-label="stacks it keeps to">
                <h3>Stacks</h3>
                {ctx.stacks.length ? (
                  <ul className={styles.got}>
                    {ctx.stacks.map((s) => (
                      <li key={s.name}>
                        <b>{s.name}</b>
                        <span className={styles.from}>{where(s.from)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.help}>None.</p>
                )}
              </section>
              <section aria-label="services and notes">
                <h3>Also</h3>
                <p className={styles.help}>
                  {ctx.services.length ? `Services in it: ${ctx.services.join(", ")}. ` : ""}
                  {ctx.notes.length ? `Notes from ${ctx.notes.map((n) => where(n.from)).join(", ")}. ` : "No notes. "}
                  Architecture from the project&apos;s board{ctx.boards.length > 1 ? " and the repository's" : ""}.
                </p>
              </section>
              <details className={styles.prompt}>
                <summary>The exact text the agent reads</summary>
                <pre>{ctx.prompt}</pre>
              </details>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
