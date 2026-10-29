import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { GarryMessage, GarryQueue } from "garry-client";
import Link from "./lib/router";
import { client } from "./lib/client";
import { GROUPS } from "./Nav";
import { Icon } from "./icons";

type Option = { id: string; label: ReactNode; hint: string; icon: ReactNode; run: () => void };

/** The browser's dictation, where there is one (Chrome, Safari, the Mac app). */
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const Dictation = (globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

const WORD: Record<GarryMessage["status"], string> = { queued: "waiting", running: "working", done: "done", failed: "stopped", cancelled: "dropped" };

/**
 * Talking to Garry, from every page: one field floating at the foot of the
 * screen. Type, or dictate (the microphone, or Cmd/Ctrl+J), and Enter puts the
 * message in line: Garry works on one at a time, so sending more never
 * interrupts what runs. What waits, what runs and what Garry answered sit just
 * above the field. Cmd/Ctrl+K focuses it; a page's name goes to that page.
 */
export default function GarryBar() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [queue, setQueue] = useState<GarryQueue | null>(null);
  const [repo, setRepo] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [history, setHistory] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const before = useRef("");

  const load = useCallback(() => client.garryQueue().then(setQueue, () => undefined), []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const listen = useCallback(() => {
    if (!Dictation) return input.current?.focus();
    if (rec.current) return rec.current.stop();
    const r = new Dictation();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = true;
    before.current = input.current?.value ? `${input.current.value.trim()} ` : "";
    r.onresult = (e) => {
      let said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      setText(before.current + said.trimStart());
    };
    r.onend = r.onerror = () => {
      rec.current = null;
      setListening(false);
    };
    rec.current = r;
    setListening(true);
    r.start();
    input.current?.focus();
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "k") (e.preventDefault(), input.current?.focus(), setOpen(true));
      else if (e.key.toLowerCase() === "j") (e.preventDefault(), listen());
    };
    // the old ways in: the rail's talk button, an idea on the dashboard
    const voice = () => listen();
    const idea = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (typeof t === "string") setText(t);
      input.current?.focus();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("garry:voice", voice);
    window.addEventListener("garry:idea", idea);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("garry:voice", voice);
      window.removeEventListener("garry:idea", idea);
    };
  }, [listen]);

  const done = () => {
    setText("");
    setOpen(false);
    rec.current?.stop();
  };
  const send = async (message: string) => {
    setError(null);
    try {
      await client.tellGarry(message, repo || undefined);
      done();
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const q = text.trim();
  const pages = GROUPS.flatMap((g) => g.links);
  const go = (l: (typeof pages)[number]): Option => ({ id: `go:${l.href}`, label: <>Go to <b>{l.label}</b></>, hint: "page", icon: l.icon, run: () => (navigate(l.href), done()) });
  const exact = pages.find((l) => l.label.toLowerCase() === q.toLowerCase());
  const like = pages.filter((l) => q && l !== exact && l.label.toLowerCase().includes(q.toLowerCase())).map(go);
  const tell: Option = { id: "tell", label: <>Tell Garry: <b>{q}</b></>, hint: "in line, one at a time", icon: Icon.agent, run: () => void send(q) };
  const build: Option = { id: "build", label: <>Start separate work: <b>{q}</b></>, hint: "its own agent in Build", icon: Icon.code, run: () => (navigate(`/build?task=${encodeURIComponent(q)}`), done()) };
  // a page's exact name goes there; anything else is for Garry
  const options: Option[] = !q ? pages.map(go) : exact ? [go(exact), tell, build, ...like] : [tell, build, ...like];
  const pick = Math.min(at, options.length - 1);

  const items = queue?.items ?? [];
  const live = items.filter((i) => i.status === "running" || i.status === "queued");
  const past = items.filter((i) => i.status === "done" || i.status === "failed").slice(-(history ? 12 : 1));
  const repos = queue?.repos ?? [];
  const drop = (id: string) => void client.dropMessage(id).then(load, (e: Error) => setError(e.message));

  return (
    <div className="garryBar">
      {open && options.length > 0 && (
        <ul className="cmdList" role="listbox" id="garry-commands" aria-label="commands">
          {options.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === pick} className={i === pick ? "on" : ""} onMouseDown={(e) => (e.preventDefault(), o.run())} onMouseEnter={() => setAt(i)}>
              <span className="cmdIcon">{o.icon}</span>
              <span className="cmdLabel">{o.label}</span>
              <span className="cmdHint">{o.hint}</span>
            </li>
          ))}
        </ul>
      )}
      {!open && (live.length > 0 || past.length > 0) && (
        <ol className="garryQueue" aria-label="what you told Garry">
          {past.map((m) => (
            <li key={m.id} data-status={m.status}>
              <span className="qDot" aria-hidden="true" />
              <span className="qText">
                <b>{m.text}</b>
                {m.reply && <span className="qReply">{m.reply.trim().split("\n").pop()}</span>}
                {m.error && <span className="qReply">{m.error}</span>}
              </span>
              {m.threadId && (
                <Link className="qAct" href={`/build/${m.threadId}`}>
                  Open
                </Link>
              )}
            </li>
          ))}
          {live.map((m, i) => (
            <li key={m.id} data-status={m.status}>
              <span className="qDot" aria-hidden="true" />
              <span className="qText">
                <b>{m.text}</b>
                <span className="qReply">{m.status === "running" ? "Garry is on it" : `waiting, ${i - live.findIndex((x) => x.status === "queued") + 1} in line`}</span>
              </span>
              {m.status === "queued" ? (
                <button type="button" className="qAct" aria-label={`drop: ${m.text}`} onClick={() => drop(m.id)}>
                  {Icon.close}
                </button>
              ) : (
                m.threadId && (
                  <Link className="qAct" href={`/build/${m.threadId}`}>
                    Follow
                  </Link>
                )
              )}
            </li>
          ))}
          {items.some((i) => i.status === "done" || i.status === "failed") && (
            <li className="qMore">
              <button type="button" onClick={() => setHistory(!history)}>
                {history ? "Show less" : "Earlier answers"}
              </button>
            </li>
          )}
        </ol>
      )}
      {error && (
        <p className="garryError" role="alert">
          {error}
        </p>
      )}
      <div className="garryField" data-listening={listening || undefined}>
        <span className="cmdPrompt" aria-hidden="true">
          {Icon.agent}
        </span>
        <input
          ref={input}
          className="cmdInput"
          role="combobox"
          aria-label="tell Garry"
          aria-expanded={open}
          aria-controls="garry-commands"
          placeholder={listening ? "Listening… Enter sends" : "Tell Garry what to do, or a page to go to"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAt(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(Boolean(text))}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setOpen(true), setAt((pick + 1) % options.length));
            else if (e.key === "ArrowUp") (e.preventDefault(), setAt((pick - 1 + options.length) % options.length));
            else if (e.key === "Enter" && q) (e.preventDefault(), (open ? options[pick] : tell).run());
            else if (e.key === "Escape") (done(), input.current?.blur());
          }}
        />
        {repos.length > 1 && (
          <select className="garryRepo" aria-label="repository" value={repo} onChange={(e) => setRepo(e.target.value)}>
            {repos.map((r, i) => (
              <option key={r.id} value={i === 0 ? "" : r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        {Dictation && (
          <button type="button" className="garryMic" aria-pressed={listening} aria-label={listening ? "stop dictating" : "dictate"} title="Dictate (Cmd/Ctrl+J)" onClick={listen}>
            {Icon.mic}
          </button>
        )}
        <button type="button" className="garrySend" aria-label="send to Garry" disabled={!q} onClick={() => void send(q)}>
          {Icon.send}
        </button>
      </div>
    </div>
  );
}
