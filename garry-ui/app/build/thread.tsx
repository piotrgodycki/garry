import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import type { PushPreview, Thread, ThreadDiff, ThreadEvent } from "garry-client";
import { client } from "../lib/client";
import { confirmAction } from "../lib/desktop";
import { PageHeader, Skeleton } from "../ui";
import styles from "./build.module.css";
import Link from "../lib/router";
import NextAgent from "./NextAgent";

function EventRow({ e }: { e: ThreadEvent }) {
  switch (e.type) {
    case "user":
      return <div className={`${styles.ev} ${styles.evUser}`}>{e.text}</div>;
    case "text":
      return <div className={styles.ev}>{e.text}</div>;
    case "tool":
      return (
        <div className={`${styles.ev} ${styles.evTool}`}>
          <b>{e.name}</b> {e.summary}
        </div>
      );
    case "tool_result":
      return e.ok ? null : <div className={`${styles.ev} ${styles.evTool} ${styles.evBad}`}>{e.preview}</div>;
    case "turn_end":
      return <div className={`${styles.ev} ${styles.evEnd}`}>{e.ok ? "Turn done" : "Turn stopped"}{e.costUsd ? ` · $${e.costUsd.toFixed(3)}` : ""}</div>;
    case "git":
      return <div className={`${styles.ev} ${styles.evEnd}`}>{e.action === "commit" ? `Committed ${e.detail.slice(0, 7)}` : `Pull request ${e.detail}`}</div>;
    case "error":
      return <div className={`${styles.ev} ${styles.evBad}`}>{e.message}</div>;
    default:
      return null;
  }
}

function Patch({ patch }: { patch: string }) {
  return (
    <pre className={styles.patch}>
      {patch.split("\n").map((l, i) => {
        const cls = l.startsWith("+") && !l.startsWith("+++") ? styles.lineAdd : l.startsWith("-") && !l.startsWith("---") ? styles.lineDel : l.startsWith("@@") ? styles.lineHunk : "";
        return (
          <span key={i} className={cls}>
            {l || " "}
          </span>
        );
      })}
    </pre>
  );
}

/** One piece of work: the conversation with the agent, its changes, commit and pull request. */
export default function ThreadView() {
  const id = useParams().id ?? "";
  const [thread, setThread] = useState<Thread | null>(null);
  const [events, setEvents] = useState<ThreadEvent[]>([]);
  const [diff, setDiff] = useState<ThreadDiff | null>(null);
  const [message, setMessage] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [push, setPush] = useState<PushPreview | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [{ thread }, d] = await Promise.all([client.thread(id), client.threadDiff(id).catch(() => null)]);
    setThread(thread);
    setDiff(d);
  }, [id]);

  useEffect(() => {
    const ctl = new AbortController();
    setEvents([]);
    void refresh();
    void client
      .threadEvents(
        id,
        (e) => {
          setEvents((list) => [...list, e]);
          // the diff and the status change when a turn ends or work is committed
          if (e.type === "status" || e.type === "git") void refresh();
        },
        ctl.signal,
      )
      .catch(() => undefined);
    return () => ctl.abort();
  }, [id, refresh]);

  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [events.length]);

  const act = async (fn: () => Promise<unknown>, confirm?: string) => {
    if (confirm && !(await confirmAction(confirm))) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (!thread) {
    return (
      <main className="page">
        <Skeleton />
      </main>
    );
  }
  const running = thread.status === "running";
  const changed = diff?.files.length ?? 0;
  return (
    <main className="page">
      <PageHeader back={{ href: "/build", label: "Build" }} title={thread.title} lede={<span className={`${styles.meta} ${styles.branch}`}>{thread.branch}</span>} />
      <div className={styles.layout}>
        <section className="card" style={{ padding: 0 }}>
          <div className={styles.timeline}>
            {events.map((e, i) => (
              <EventRow key={i} e={e} />
            ))}
            {running && <div className={`${styles.ev} ${styles.evEnd}`}><span className="badge run">Working</span></div>}
            <div ref={bottom} />
          </div>
          <div className={styles.composer}>
            <textarea
              className={`input ${styles.prompt}`}
              style={{ minHeight: 64 }}
              aria-label="reply to the agent"
              placeholder={running ? "The agent is working…" : "Reply, or ask for another change, a fix or an explanation"}
              value={message}
              disabled={running}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && message.trim() && !running) void act(async () => (await client.sendMessage(id, message), setMessage("")));
              }}
            />
            <div className={styles.row}>
              {running ? (
                <button className="btn btnDanger" onClick={() => void act(() => client.stopThread(id))}>
                  Stop
                </button>
              ) : (
                <button className="btn btnPrimary" disabled={!message.trim() || busy} onClick={() => void act(async () => (await client.sendMessage(id, message), setMessage("")))}>
                  Send
                </button>
              )}
              {error && <span className="badge danger">{error}</span>}
            </div>
          </div>
        </section>

        <section className="card" style={{ padding: 0 }}>
          <div className={styles.composer} style={{ borderTop: 0 }}>
            <span className="eyebrow">
              Changes · {changed} file{changed === 1 ? "" : "s"}
            </span>
          </div>
          {diff === null ? (
            <Skeleton />
          ) : (
            <>
              <div className={styles.files}>
                {diff.files.map((f) => (
                  <div key={f.path} className={styles.file}>
                    <Link className={styles.fileLink} title="open in Files" href={`/files?root=thread:${id}&path=${encodeURIComponent(f.path)}`}>
                      {f.path}
                    </Link>
                    <span>
                      <span className={styles.add}>+{f.additions}</span> <span className={styles.del}>−{f.deletions}</span>
                    </span>
                  </div>
                ))}
              </div>
              {diff.patch && <Patch patch={diff.patch} />}
            </>
          )}
          <div className={styles.actions}>
            {thread.pr ? (
              <a className="btn btnPrimary" href={thread.pr.url} target="_blank" rel="noreferrer">
                Open pull request #{thread.pr.number}
              </a>
            ) : (
              <>
                <input className="input" placeholder={`Commit message (empty: "${thread.title}")`} aria-label="commit message" value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} />
                <div className={styles.row}>
                  <button className="btn btnPrimary" disabled={running || busy || !diff?.uncommitted} onClick={() => void act(() => client.commitThread(id, commitMsg), "commit these changes")}>
                    Commit
                  </button>
                  <button
                    className="btn btnGhost"
                    disabled={running || busy || !thread.commit || Boolean(diff?.uncommitted) || Boolean(push)}
                    onClick={() =>
                      void act(async () => {
                        const p = await client.pushPreview(id);
                        // the project allows pushing without asking: go ahead
                        if (p.mode !== "allow" || p.refused) return setPush(p);
                        if (await confirmAction("open a pull request")) await client.openPullRequest(id);
                      })
                    }
                  >
                    Open pull request
                  </button>
                </div>
                {push && (
                  <div className={styles.pushBox} role="dialog" aria-label="Confirm the push">
                    {push.refused ? (
                      <span className="badge danger">{push.refused}</span>
                    ) : (
                      <span className="eyebrow">This project asks before pushing</span>
                    )}
                    <dl className={styles.pushFacts}>
                      <dt>Branch</dt>
                      <dd>{push.branch}</dd>
                      <dt>To</dt>
                      <dd>{push.remote ?? "no GitHub remote"}</dd>
                      <dt>Pull request into</dt>
                      <dd>
                        {push.base}
                        {push.draft ? " (draft)" : ""}
                      </dd>
                      <dt>Commits</dt>
                      <dd>
                        {push.commits.map((c) => (
                          <div key={c.sha}>
                            <code>{c.sha}</code> {c.subject}
                          </div>
                        ))}
                      </dd>
                    </dl>
                    <div className={styles.row}>
                      {!push.refused && (
                        <button
                          className="btn btnPrimary"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await client.openPullRequest(id, undefined, undefined, true);
                              setPush(null);
                            }, `push ${push.branch} to ${push.remote}`)
                          }
                        >
                          Push and open pull request
                        </button>
                      )}
                      <button className="btn" onClick={() => setPush(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
      <NextAgent thread={thread} />
    </main>
  );
}
