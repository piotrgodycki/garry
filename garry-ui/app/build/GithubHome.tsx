import { useEffect, useState } from "react";
import { client } from "../lib/client";
import { confirmAction } from "../lib/desktop";
import Link from "../lib/router";
import { Icon } from "../icons";
import styles from "./build.module.css";

/**
 * A repository's home on GitHub. One that has none gets a proposal, named as
 * it is in Garry, and is created only when you say yes: private unless you
 * untick it, then added as origin with the current branch pushed.
 */
export default function GithubHome({ projectId }: { projectId: string }) {
  const [home, setHome] = useState<{ remote: string | null; create: { owner: string; name: string } | null } | null>(null);
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [priv, setPriv] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    client.githubRepo(projectId).then((h) => {
      setHome(h);
      setOwner(h.create?.owner ?? "");
      setName(h.create?.name ?? "");
    }, () => setHome(null));
  useEffect(() => void load(), [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!home) return null;
  if (home.remote)
    return (
      <p className={styles.githubHome}>
        {Icon.github}
        On GitHub:{" "}
        <a href={`https://github.com/${home.remote}`} target="_blank" rel="noreferrer">
          {home.remote}
        </a>
      </p>
    );
  if (!home.create)
    return (
      <p className={styles.githubHome}>
        {Icon.github}
        Not on GitHub yet. <Link href="/settings#github">Connect GitHub</Link> and Garry offers to create it.
      </p>
    );

  const create = async () => {
    if (!(await confirmAction(`create ${owner}/${name} on GitHub`))) return;
    setBusy(true);
    setError(null);
    try {
      await client.createGithubRepo(projectId, { owner, name, private: priv });
      await load();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.githubCreate} role="group" aria-label="create it on GitHub">
      <p className={styles.githubHome}>
        {Icon.github}
        Not on GitHub yet. Garry can create it, named as it is here.
      </p>
      <div className={styles.githubFields}>
        <label>
          <span className="fieldLabel">Owner</span>
          <input className="input" aria-label="GitHub owner" value={owner} onChange={(e) => setOwner(e.target.value)} spellCheck={false} />
        </label>
        <span aria-hidden="true">/</span>
        <label>
          <span className="fieldLabel">Name</span>
          <input className="input" aria-label="GitHub repository name" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
        </label>
      </div>
      <label className={styles.githubCheck}>
        <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
        Private
      </label>
      <div className={styles.row}>
        <button className="btn btnPrimary" disabled={busy || !owner.trim() || !name.trim()} onClick={() => void create()}>
          {busy ? "Creating…" : `Create ${owner}/${name} on GitHub`}
        </button>
        {error && (
          <span className="badge danger" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
