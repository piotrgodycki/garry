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
      return <div className={`${styles.ev} ${styles.evEnd}`}>{e.action === "commit" ? `Committed ${e.detail.slice(0, 7)}` : e.action === "repo" ? `Created ${e.detail}` : `Pull request ${e.detail}`}</div>;
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
  // a repository not on GitHub yet: the name to create it under, and whether it is private
  const [newRepo, setNewRepo] = useState({ name: "", private: true });
  const bottom = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [{ thread, events: log }, d] = await Promise.all([client.thread(id), client.threadDiff(id).catch(() => null)]);
    setThread(thread);
    setDiff(d);
    // the log as the server has it: catches up whatever the live stream has not brought yet
    setEvents((list) => (log.length > list.length ? log : list));
  }, [id]);

  useEffect(() => {
    const ctl = new AbortController();
    void refresh();
    setEvents([]);
    // the log so far, then live; a stream that drops (a sleeping laptop, a restart) is opened again.
    // The stream sends the whole log from the start, so the k-th event it brings is kept only when
    // the list does not have it yet (a refresh may have brought it first).
    const follow = async () => {
      while (!ctl.signal.aborted) {
        let k = 0;
        await client
          .threadEvents(
            id,
            (e) => {
              const at = k++;
              setEvents((list) => (list.length > at ? list : [...list, e]));
              // the diff and the status change when a turn ends or work is committed
              if (e.type === "status" || e.type === "git") void refresh();
            },
            ctl.signal,
          )
          .catch(() => undefined);
        if (!ctl.signal.aborted) await new Promise((r) => setTimeout(r, 1500));
      }
    };
    void follow();
    return () => ctl.abort();
  }, [id, refresh]);

  // braces: newer browsers return a promise from scrollIntoView, and React would call it as the cleanup
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

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
                        // asks first, refused, or not on GitHub yet (creating it needs your yes)
                        if (p.mode !== "allow" || p.refused || p.create) {
                          setNewRepo({ name: p.create?.name ?? "", private: true });
                          return setPush(p);
                        }
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
                    ) : push.create ? (
                      <span className="eyebrow">Not on GitHub yet: Garry creates it first</span>
                    ) : (
                      <span className="eyebrow">This project asks before pushing</span>
                    )}
                    <dl className={styles.pushFacts}>
                      <dt>Branch</dt>
                      <dd>{push.branch}</dd>
                      <dt>To</dt>
                      <dd>
                        {push.remote ??
                          (push.create ? (
                            <span className={styles.githubFields}>
                              <span>{push.create.owner} /</span>
                              <input className="input" aria-label="new GitHub repository name" value={newRepo.name} onChange={(e) => setNewRepo({ ...newRepo, name: e.target.value })} spellCheck={false} />
                              <label className={styles.githubCheck}>
                                <input type="checkbox" checked={newRepo.private} onChange={(e) => setNewRepo({ ...newRepo, private: e.target.checked })} />
                                Private
                              </label>
                            </span>
                          ) : (
                            "no GitHub remote"
                          ))}
                      </dd>
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
                          disabled={busy || (Boolean(push.create) && !newRepo.name.trim())}
                          onClick={() =>
                            void act(
                              async () => {
                                await client.openPullRequest(id, undefined, undefined, true, push.create ? { owner: push.create.owner, name: newRepo.name.trim(), private: newRepo.private } : undefined);
                                setPush(null);
                              },
                              push.create ? `create ${push.create.owner}/${newRepo.name.trim()} on GitHub and push ${push.branch}` : `push ${push.branch} to ${push.remote}`,
                            )
                          }
                        >
                          {push.create ? "Create the repository, push and open pull request" : "Push and open pull request"}
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
