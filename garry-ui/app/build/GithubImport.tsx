import { useEffect, useRef, useState } from "react";
import { GarryError, type GithubDeviceCode, type GithubRepo, type GithubStatus, type Project } from "garry-client";
import { client } from "../lib/client";
import styles from "./build.module.css";

const SOURCE: Record<string, string> = { env: "GARRY_GITHUB_TOKEN", garry: "connected in Garry", gh: "the GitHub CLI" };

/**
 * Connect GitHub and import a repository as a project, on this computer only:
 * paste a token, sign in with a code (when an OAuth app is set up), or use the
 * GitHub CLI's own sign in. Imported repositories are cloned into ~/.garry/repos.
 */
export default function GithubImport({ onImported }: { onImported: (p: Project) => void }) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [token, setToken] = useState("");
  const [device, setDevice] = useState<GithubDeviceCode | null>(null);
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef(0);

  const fail = (e: unknown) => {
    if (e instanceof GarryError && e.status === 403) setBlocked(true);
    else setError(String((e as Error).message ?? e));
  };
  const refresh = () => client.githubStatus().then(setStatus, fail);
  useEffect(() => {
    void refresh();
    return () => void (polling.current = 0);
  }, []);

  // the repository list, filtered as you type
  useEffect(() => {
    if (!status?.connected) return;
    const t = setTimeout(() => client.githubRepos(query).then(setRepos, fail), 250);
    return () => clearTimeout(t);
  }, [status?.connected, query]);

  const run = async (what: string, f: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await f();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const connect = () =>
    run("token", async () => {
      await client.connectGithubToken(token);
      setToken("");
      await refresh();
    });

  const signIn = () =>
    run("device", async () => {
      const d = await client.startGithubDevice();
      setDevice(d);
      const id = ++polling.current;
      let wait = Math.max(d.interval, 1) * 1000;
      const until = Date.now() + d.expiresIn * 1000;
      while (polling.current === id && Date.now() < until) {
        await new Promise((r) => setTimeout(r, wait));
        if (polling.current !== id) return;
        const r = await client.pollGithubDevice(d.deviceCode);
        if (r.status === "slow_down") wait += 5000;
        if (r.status === "done") break;
        if (r.status === "denied" || r.status === "expired") throw new Error(r.status === "denied" ? "sign in was cancelled on GitHub" : "the code expired, try again");
      }
      setDevice(null);
      await refresh();
    }).finally(() => setDevice(null));

  const disconnect = () =>
    run("logout", async () => {
      await client.disconnectGithub();
      setRepos(null);
      await refresh();
    });

  const importRepo = (r: GithubRepo) =>
    run(r.fullName, async () => {
      onImported(await client.importProject(r.fullName));
    });

  if (blocked) return <p className={styles.filesNote}>Connecting GitHub and importing repositories works on the computer running Garry.</p>;
  if (!status) return <p className={styles.filesNote}>Checking GitHub…</p>;

  return (
    <div className={styles.newForm}>
      {status.connected ? (
        <>
          <div className={styles.row}>
            <span className="badge ok">Connected as {status.login}</span>
            <span className={styles.meta}>via {SOURCE[status.source ?? ""] ?? status.source}</span>
            {status.source === "garry" && (
              <button className="btn" disabled={!!busy} onClick={() => void disconnect()}>
                Disconnect
              </button>
            )}
          </div>
          <input className="input" placeholder="Search your repositories" value={query} onChange={(e) => setQuery(e.target.value)} />
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
      ) : (
        <>
          <p className={styles.filesNote}>
            {status.error ? `${status.error}. ` : ""}Connect GitHub to import your repositories and open pull requests.
            {status.deviceFlow ? " Sign in with a code, or paste a token." : " Paste a personal access token (repo scope), or sign in with the GitHub CLI (gh auth login)."}
          </p>
          {status.deviceFlow &&
            (device ? (
              <div className={styles.row}>
                <span className="eyebrow">Enter this code on GitHub</span>
                <code className={styles.deviceCode}>{device.userCode}</code>
                <a className="btn btnPrimary" href={device.verificationUri} target="_blank" rel="noreferrer">
                  Open GitHub
                </a>
                <button className="btn" onClick={() => void (polling.current = 0)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className={styles.row}>
                <button className="btn btnPrimary" disabled={!!busy} onClick={() => void signIn()}>
                  Sign in with GitHub
                </button>
              </div>
            ))}
          <div className={styles.row}>
            <input
              className="input"
              style={{ flex: 1, minWidth: 220 }}
              type="password"
              autoComplete="off"
              placeholder="ghp_… or github_pat_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && token.trim() && !busy && void connect()}
            />
            <button className="btn" disabled={!token.trim() || !!busy} onClick={() => void connect()}>
              {busy === "token" ? "Checking…" : "Connect"}
            </button>
          </div>
        </>
      )}
      {error && <span className="badge danger">{error}</span>}
    </div>
  );
}
