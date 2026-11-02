import { useCallback, useEffect, useRef, useState } from "react";
import { GarryError, type GithubDeviceCode, type GithubStatus } from "garry-client";
import { client } from "../lib/client";
import styles from "./settings.module.css";
import { useLatest } from "../lib/useLatest";

const SOURCE: Record<string, string> = { env: "GARRY_GITHUB_TOKEN in .env.local", garry: "the token saved in Garry", gh: "the GitHub CLI (gh auth login)" };
const NEW_TOKEN = "https://github.com/settings/personal-access-tokens/new";

/** Local to this computer. A pasted token is kept in ~/.garry/github.json, readable by you only; code sign-in needs an OAuth app. */
export default function GithubConnect({ onChange }: { onChange?: (s: GithubStatus) => void }) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [token, setToken] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [device, setDevice] = useState<GithubDeviceCode | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef(0);

  const fail = useCallback((e: unknown) => {
    if (e instanceof GarryError && e.status === 403) setBlocked(true);
    else setError(String((e as Error).message ?? e));
  }, []);
  const changed = useLatest(onChange);
  const refresh = useCallback(
    () =>
      client.githubStatus().then((s) => {
        setStatus(s);
        changed.current?.(s);
      }, fail),
    [changed, fail],
  );
  useEffect(() => {
    void refresh();
    return () => void (polling.current = 0);
  }, [refresh]);

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

  const save = () =>
    run("token", async () => {
      await client.connectGithubToken(token);
      setToken("");
      setReplacing(false);
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
        if (r.status === "denied" || r.status === "expired")
          throw new Error(r.status === "denied" ? "sign in was cancelled on GitHub" : "the code expired, try again");
      }
      await refresh();
    }).finally(() => setDevice(null));

  const disconnect = () =>
    run("logout", async () => {
      await client.disconnectGithub();
      await refresh();
    });

  if (blocked) return <p className={styles.note}>The GitHub connection is set on the computer running Garry.</p>;
  if (!status) return <p className={styles.note}>Checking GitHub…</p>;

  const tokenForm = (
    <div className={styles.row}>
      <input
        className="input"
        style={{ flex: 1, minWidth: 220 }}
        type="password"
        autoComplete="off"
        aria-label="GitHub token"
        placeholder="Paste a token: github_pat_… or ghp_…"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && token.trim() && !busy && void save()}
      />
      <button className="btn btnPrimary" disabled={!token.trim() || !!busy} onClick={() => void save()}>
        {busy === "token" ? "Checking…" : "Save token"}
      </button>
      {replacing && (
        <button className="btn" onClick={() => setReplacing(false)}>
          Cancel
        </button>
      )}
    </div>
  );

  return (
    <div className={styles.stack}>
      {status.connected ? (
        <div className={styles.row}>
          <span className="badge ok">Connected as {status.login}</span>
          <span className={styles.meta}>via {SOURCE[status.source ?? ""] ?? status.source}</span>
          {!replacing && (
            <button className="btn" disabled={!!busy} onClick={() => setReplacing(true)}>
              {status.source === "garry" ? "Replace token" : "Use a token instead"}
            </button>
          )}
          {status.source === "garry" && (
            <button className="btn btnGhost" disabled={!!busy} onClick={() => void disconnect()}>
              Disconnect
            </button>
          )}
        </div>
      ) : (
        <p className={styles.note}>
          {status.error ? `${status.error}. ` : ""}Not connected. Garry needs GitHub to import repositories, open pull requests and show their checks.
        </p>
      )}
      {status.source === "env" && (
        <p className={styles.note}>GARRY_GITHUB_TOKEN in .env.local wins over a token saved here; remove it there to use this one.</p>
      )}

      {(!status.connected || replacing) && (
        <>
          {tokenForm}
          <p className={styles.note}>
            A fine-grained token from{" "}
            <a href={NEW_TOKEN} target="_blank" rel="noreferrer">
              GitHub, Developer settings
            </a>
            : repository access to the repositories Garry works on, with Contents and Pull requests set to read and write. Garry checks it with GitHub and keeps
            it in ~/.garry/github.json, readable by you only.
          </p>
          {status.deviceFlow &&
            (device ? (
              <div className={styles.row}>
                <span className="eyebrow">Enter this code on GitHub</span>
                <code className={styles.code}>{device.userCode}</code>
                <a className="btn btnPrimary" href={device.verificationUri} target="_blank" rel="noreferrer">
                  Open GitHub
                </a>
                <button className="btn" onClick={() => void (polling.current = 0)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className={styles.row}>
                <span className={styles.meta}>or</span>
                <button className="btn" disabled={!!busy} onClick={() => void signIn()}>
                  Sign in with GitHub
                </button>
              </div>
            ))}
        </>
      )}
      {error && <span className="badge danger">{error}</span>}
    </div>
  );
}
