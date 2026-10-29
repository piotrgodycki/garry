import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { LiveAsk, LiveLane, LiveState, LiveView, ThreadEvent } from "garry-client";
import Link from "../lib/router";
import { useNavigate } from "react-router";
import { client } from "../lib/client";
import { Icon } from "../icons";
import { PageHeader, ServerNotice, Skeleton } from "../ui";
import styles from "./live.module.css";
import CrewFace, { type CrewState } from "../Crew";
import Illustrated from "../Illustrations";

/** The words for a state, the same everywhere on this screen. */
const WORD: Record<LiveState, string> = { work: "Working", wait: "Needs you", fail: "Failed", done: "Ready" };
const ZOOMS = [
  { key: "15m", label: "15 min", span: 15 * 60_000, step: 5 * 60_000 },
  { key: "1h", label: "1 hour", span: 3600_000, step: 10 * 60_000 },
  { key: "today", label: "Today", span: 0, step: 0 },
] as const;
type Zoom = (typeof ZOOMS)[number]["key"];

const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const ago = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const money = (n: number) => `$${n.toFixed(2)}`;
/** The crew face for a lane's state; a shipped lane rests. */
const face = (s: string): CrewState => (s === "work" || s === "wait" || s === "fail" || s === "done" ? s : "idle");

/** The window a zoom shows: up to a little after now, so the now line has room. */
function windowOf(zoom: Zoom, now: number): { start: number; end: number; step: number } {
  const z = ZOOMS.find((x) => x.key === zoom)!;
  if (z.span) return { start: now - z.span * 0.94, end: now + z.span * 0.06, step: z.step };
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  // today: from midnight, or the last hour early in the morning
  const start = Math.min(midnight.getTime(), now - 3600_000);
  const span = now - start;
  return { start, end: now + span * 0.04, step: span > 8 * 3600_000 ? 2 * 3600_000 : span > 3 * 3600_000 ? 3600_000 : 30 * 60_000 };
}

/**
 * Live: every agent of the project as a lane on a timeline, what needs you
 * beside it with the agent's own words and an answer box, and the lane you
 * pick followed below: what it does, step by step, and what it has cost.
 */
export default function Live() {
  const navigate = useNavigate();
  const [view, setView] = useState<LiveView | null>(null);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState<Zoom>("1h");
  const [picked, setPicked] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(
    () =>
      client.live(24).then(
        (v) => {
          setView(v);
          setError(false);
          setNow(Date.now());
        },
        () => setError(true),
      ),
    [],
  );
  useEffect(() => {
    void load();
    const poll = setInterval(load, 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const win = windowOf(zoom, now);
  // a lane shows while it is active, or when something of it falls in the window
  const lanes = useMemo(
    () => (view?.lanes ?? []).filter((l) => (l.state && l.state !== "done") || l.segments.some((s) => (s.to ? new Date(s.to).getTime() : now) >= win.start)),
    [view, now, win.start],
  );
  const selected = lanes.find((l) => l.threadId === picked) ?? lanes[0] ?? null;
  const move = useCallback(
    (by: number) => {
      if (!lanes.length) return;
      const at = Math.max(0, lanes.findIndex((l) => l.threadId === selected?.threadId));
      setPicked(lanes[(at + by + lanes.length) % lanes.length].threadId);
    },
    [lanes, selected],
  );

  // J and K move between lanes from anywhere on the screen, as long as you are not typing
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "j") move(1);
      else if (e.key === "k") move(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [move]);

  const working = view?.lanes.filter((l) => l.state === "work").length ?? 0;
  return (
    <main className={`page ${styles.live}`}>
      <PageHeader
        title="Live"
        lede="Every agent at work, as it happens. Answer what needs you right here; pick a lane to follow it step by step."
        actions={
          view && (
            <span className={styles.spend} aria-label={`spent today ${money(view.spentToday)}`}>
              {Icon.coin}
              <b>{money(view.spentToday)}</b> today
            </span>
          )
        }
      />
      {error && !view && <ServerNotice />}
      {!view && !error && <Skeleton rows={4} />}
      {view && (
        <div className={view.needsYou.length ? styles.grid : styles.single}>
          {/* what needs you takes a column only while something does */}
          {view.needsYou.length > 0 && (
            <section className={styles.needs} aria-labelledby="needs-you">
              <h2 id="needs-you" className={styles.colHead}>
                {Icon.inbox}
                Needs you
                <span className={styles.count}>{view.needsYou.length}</span>
              </h2>
              {view.needsYou.map((a) => (
                <Ask key={`${a.threadId}:${a.at}`} ask={a} now={now} onDone={load} />
              ))}
            </section>
          )}

          <section className={styles.board} aria-labelledby="agents">
            <div className={styles.boardHead}>
              <h2 id="agents" className={styles.colHead}>
                Agents
              </h2>
              <span className={styles.sub}>{working ? `${working} working` : "none working"}</span>
              {view.needsYou.length === 0 && (
                <span className={styles.caughtUp}>
                  {Icon.check}
                  Nothing needs you
                </span>
              )}
              <div className={styles.legend} aria-hidden="true">
                {(["work", "wait", "done", "fail"] as const).map((s) => (
                  <span key={s} data-state={s}>
                    <i />
                    {WORD[s]}
                  </span>
                ))}
              </div>
              <div className={styles.zoom} role="group" aria-label="time span">
                {ZOOMS.map((z) => (
                  <button key={z.key} type="button" aria-pressed={zoom === z.key} onClick={() => setZoom(z.key)}>
                    {z.label}
                  </button>
                ))}
              </div>
            </div>

            {lanes.length === 0 ? (
              <div className={styles.timeline}>
                <Illustrated art="plantFeature" title="No agent at work in this time" action={<Link className="btn btnPrimary" href="/build">Start work in Build</Link>}>
                  Tell Garry what to build with <kbd className="kbd">⌘K</kbd>, or start an agent in Build. Its lane shows up here as it works.
                </Illustrated>
              </div>
            ) : (
              <Timeline
                lanes={lanes}
                win={win}
                now={now}
                selected={selected?.threadId ?? null}
                onPick={setPicked}
                onMove={move}
                onOpen={(id) => navigate(`/build/${id}`)}
              />
            )}
            {selected && <Agent lane={selected} now={now} onChange={load} />}
          </section>
        </div>
      )}
    </main>
  );
}

function Timeline({
  lanes,
  win,
  now,
  selected,
  onPick,
  onMove,
  onOpen,
}: {
  lanes: LiveLane[];
  win: { start: number; end: number; step: number };
  now: number;
  selected: string | null;
  onPick: (id: string) => void;
  onMove: (by: number) => void;
  onOpen: (id: string) => void;
}) {
  const span = win.end - win.start;
  const pct = (t: number) => ((t - win.start) / span) * 100;
  const ticks: number[] = [];
  for (let t = Math.ceil(win.start / win.step) * win.step; t < win.end; t += win.step) ticks.push(t);
  // no time right under the now label
  const shown = ticks.filter((t) => pct(now) - pct(t) > 7 || pct(t) - pct(now) > 2);
  return (
    <div className={styles.timeline}>
      <div className={styles.axis} aria-hidden="true">
        <span />
        <div className={styles.ticks}>
          {shown.map((t) => (
            <span key={t} style={{ left: `${pct(t)}%` }}>
              {hm(t)}
            </span>
          ))}
          <span className={styles.now} style={{ left: `${pct(now)}%` }} data-now={hm(now)} />
        </div>
      </div>
      <div
        className={styles.lanes}
        role="listbox"
        aria-label="agents"
        tabIndex={0}
        aria-activedescendant={selected ? `lane-${selected}` : undefined}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), onMove(1));
          else if (e.key === "ArrowUp") (e.preventDefault(), onMove(-1));
          else if (e.key === "Enter" && selected) (e.preventDefault(), onOpen(selected));
        }}
      >
        {lanes.map((l) => (
          <div
            key={l.threadId}
            id={`lane-${l.threadId}`}
            role="option"
            aria-selected={l.threadId === selected}
            aria-label={`${l.title}, ${l.state ? WORD[l.state] : "shipped"}`}
            className={styles.lane}
            onClick={() => onPick(l.threadId)}
            onDoubleClick={() => onOpen(l.threadId)}
          >
            <div className={styles.who}>
              <CrewFace role={l.role === "reviewer" ? "reviewer" : "dev"} state={face(l.state ?? "shipped")} />
              <div className={styles.name}>
                <b>{l.title}</b>
                <span>
                  {l.project} · {l.state ? WORD[l.state] : "Shipped"}
                </span>
              </div>
            </div>
            <div className={styles.track} style={{ backgroundSize: `${(win.step / span) * 100}% 100%`, backgroundPosition: `${pct(ticks[0] ?? win.start)}% 0` }}>
              {l.segments.map((s, i) => {
                const from = Math.max(new Date(s.from).getTime(), win.start);
                const to = Math.min(s.to ? new Date(s.to).getTime() : now, win.end);
                if (to <= win.start || from >= win.end) return null;
                return (
                  <span
                    key={i}
                    className={styles.seg}
                    data-state={s.state}
                    data-open={s.to === null || undefined}
                    style={{ left: `${pct(from)}%`, width: `max(${pct(to) - pct(from)}%, 6px)` }}
                    title={`${WORD[s.state]}: ${s.label} (${hm(new Date(s.from).getTime())} to ${s.to ? hm(new Date(s.to).getTime()) : "now"})`}
                  >
                    {/* a label only where it has room to be read */}
                    {pct(to) - pct(from) > 6 ? s.label : null}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        <span className={styles.nowLine} style={{ left: `calc(var(--who) + (100% - var(--who)) * ${pct(now) / 100})` }} aria-hidden="true" />
      </div>
    </div>
  );
}

/** What needs you: the agent's own words, and the answer right here. */
function Ask({ ask, now, onDone }: { ask: LiveAsk; now: number; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (message: string) => {
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await client.sendMessage(ask.threadId, message.trim());
      setText("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };
  const question = ask.kind === "question";
  return (
    <article className={styles.ask} data-kind={ask.kind} aria-label={`${ask.title}: ${question ? "asks a question" : "stopped before finishing"}`}>
      <div className={styles.askTop}>
        <CrewFace role="dev" state={face(question ? "wait" : "fail")} />
        <div className={styles.askWho}>
          <span>
            <b>{ask.title}</b> · {ask.project}
          </span>
          <strong>{question ? "Asks a question" : "Stopped before finishing"}</strong>
        </div>
        <span className={styles.age}>{ago(ask.at, now)}</span>
      </div>
      {question || ask.text !== "Stopped before finishing" ? (
        <p className={question ? styles.msg : `${styles.msg} ${styles.mono}`}>{ask.text}</p>
      ) : (
        <p className={styles.msg}>It did not say why. Let it fix what went wrong, or open the work to look.</p>
      )}
      {question ? (
        <form className={styles.answer} onSubmit={submit}>
          <input className="input" aria-label={`answer ${ask.title}`} placeholder="Type your answer" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
          <button className="btn btnPrimary" type="submit" disabled={busy || !text.trim()}>
            Send
          </button>
        </form>
      ) : (
        <div className={styles.acts}>
          <button className="btn btnPrimary" type="button" disabled={busy} onClick={() => void send("That stopped before finishing. Look at what went wrong, fix it, and finish the task.")}>
            Let it fix
          </button>
        </div>
      )}
      <Link className={styles.open} href={`/build/${ask.threadId}`}>
        Open the work
      </Link>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

/** The lane you picked: what it does, step by step, and what it has cost. */
function Agent({ lane, now, onChange }: { lane: LiveLane; now: number; onChange: () => void }) {
  const [events, setEvents] = useState<ThreadEvent[] | null>(null);
  const log = useRef<HTMLOListElement>(null);
  const last = lane.segments[lane.segments.length - 1];
  // the log again whenever the lane moves on (a tool, a turn, an answer)
  const key = `${lane.threadId}:${lane.tools}:${lane.turns}:${lane.segments.length}`;
  useEffect(() => {
    let alive = true;
    client.thread(lane.threadId).then(
      (r) => alive && setEvents(r.events),
      () => alive && setEvents([]),
    );
    return () => {
      alive = false;
    };
  }, [key, lane.threadId]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [events]);
  const steps = (events ?? []).filter((e) => e.type !== "status" && e.type !== "tool_result").slice(-40);
  const failedTools = new Set((events ?? []).filter((e) => e.type === "tool_result" && !e.ok).map((e) => (e as { id: string }).id));
  const ran = new Date(last?.to ?? now).getTime() - new Date(lane.startedAt).getTime();
  return (
    <section className={styles.agent} aria-label={`agent: ${lane.title}`}>
      <div className={styles.agentHead}>
        <CrewFace role={lane.role === "reviewer" ? "reviewer" : "dev"} state={face(lane.state ?? "shipped")} />
        <div className={styles.name}>
          <b>{lane.title}</b>
          <span>{lane.doing ?? `${lane.project} · ${lane.state ? WORD[lane.state] : "Shipped"}`}</span>
        </div>
        <div className={styles.acts}>
          {lane.state === "work" && (
            <button className="btn" type="button" onClick={() => void client.stopThread(lane.threadId).then(onChange)}>
              {Icon.stop}
              Stop
            </button>
          )}
          <Link className="btn btnPrimary" href={`/build/${lane.threadId}`}>
            Open
          </Link>
        </div>
      </div>
      <div className={styles.agentBody}>
        <ol className={styles.log} ref={log} aria-label="what it did">
          {events === null && <li className={styles.dim}>Loading…</li>}
          {steps.map((e, i) => (
            <li key={i} data-kind={e.type} data-failed={(e.type === "tool" && failedTools.has(e.id)) || undefined}>
              <time>{hm(new Date(e.at).getTime())}</time>
              {e.type === "user" && (
                <>
                  <b>You</b>
                  <span>{e.text}</span>
                </>
              )}
              {e.type === "text" && (
                <>
                  <b>Says</b>
                  <span>{e.text}</span>
                </>
              )}
              {e.type === "tool" && (
                <>
                  <b>{e.name}</b>
                  <span>{e.summary}</span>
                </>
              )}
              {e.type === "turn_end" && (
                <>
                  <b>{e.ok ? "Done" : "Stopped"}</b>
                  <span>{e.costUsd ? `this turn cost ${money(e.costUsd)}` : ""}</span>
                </>
              )}
              {e.type === "git" && (
                <>
                  <b>{e.action === "pr" ? "Pull request" : "Commit"}</b>
                  <span>{e.detail}</span>
                </>
              )}
              {e.type === "error" && (
                <>
                  <b>Error</b>
                  <span>{e.message}</span>
                </>
              )}
            </li>
          ))}
          {lane.state === "work" && <li className={styles.cursor} aria-hidden="true" />}
        </ol>
        <dl className={styles.stats}>
          <div>
            <dt>Cost</dt>
            <dd>{money(lane.costUsd)}</dd>
          </div>
          <div>
            <dt>Turns</dt>
            <dd>{lane.turns}</dd>
          </div>
          <div>
            <dt>Steps</dt>
            <dd>{lane.tools}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{ran < 3600_000 ? `${Math.max(1, Math.round(ran / 60_000))} min` : `${Math.floor(ran / 3600_000)} h ${Math.round((ran % 3600_000) / 60_000)} min`}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
