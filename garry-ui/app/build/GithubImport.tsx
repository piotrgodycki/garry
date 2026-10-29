import { useEffect, useState } from "react";
import { GarryError, type GithubRepo, type GithubStatus, type Project } from "garry-client";
import { client } from "../lib/client";
import Link from "../lib/router";
import GithubConnect from "../settings/GithubConnect";
import styles from "./build.module.css";

/**
 * Import a GitHub repository as a project, on this computer only. Connecting
 * (the token) is the same as in Settings; imported repositories are cloned
 * into ~/.garry/repos.
 */
export default function GithubImport({ onImported }: { onImported: (p: Project) => void }) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // the repository list, filtered as you type
  useEffect(() => {
    if (!status?.connected) return;
    const t = setTimeout(() => client.githubRepos(query).then(setRepos, (e) => setError(String((e as Error).message ?? e))), 250);
    return () => clearTimeout(t);
  }, [status?.connected, query]);

  const importRepo = async (r: GithubRepo) => {
    setBusy(r.fullName);
    setError(null);
    try {
      onImported(await client.importProject(r.fullName));
    } catch (e) {
      setError(e instanceof GarryError && e.status === 403 ? "Importing works on the computer running Garry." : String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.newForm}>
      <GithubConnect onChange={setStatus} />
      {status?.connected && (
        <>
          <input className="input" placeholder="Search your GitHub repositories" aria-label="search your GitHub repositories" value={query} onChange={(e) => setQuery(e.target.value)} />
          {repos === null ? (
            <p className={styles.filesNote}>Loading repositories…</p>
          ) : repos.length === 0 ? (
            <p className={styles.filesNote}>No repositories match.</p>
          ) : (
            <div className={styles.repoList}>
              {repos.slice(0, 30).map((r) => (
                <div key={r.fullName} className={styles.repo}>
                  <span className={styles.itemTitle}>
                    {r.fullName} {r.private && <span className="badge">private</span>}
                  </span>
                  <button className="btn" disabled={!!busy} onClick={() => void importRepo(r)}>
                    {busy === r.fullName ? "Cloning…" : "Import"}
                  </button>
                  {r.description && <span className={styles.meta}>{r.description}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {status && !status.connected && (
        <p className={styles.filesNote}>
          The token is kept in <Link href="/settings">Settings</Link> too.
        </p>
      )}
      {error && <span className="badge danger">{error}</span>}
    </div>
  );
}
