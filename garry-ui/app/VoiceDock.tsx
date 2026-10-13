"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./voicedock.module.css";
import Waveform from "./Waveform";
import { Icon } from "./icons";
import GarryMark from "./GarryMark";

type State = "idle" | "listening" | "speaking";
interface Turn {
  role: "you" | "garry";
  text: string;
}

/** A docked voice panel beside the app. Toggle with Cmd/Ctrl+K, or the Garry hub,
 *  or the window event "garry:voice". Web Speech API when available, text fallback. */
export default function VoiceDock() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const heardRef = useRef("");
  const feedRef = useRef<HTMLDivElement>(null);
  const pttRef = useRef(false);
  const startRef = useRef<() => void>(() => {});

  // Resolved after mount: the server cannot know, and guessing caused a hydration mismatch.
  const [supported, setSupported] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    // An idea captured on the dashboard opens the dock prefilled, so the human can
    // talk it through with Garry before it ever becomes a feature.
    const onIdea = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      setOpen(true);
      if (typeof text === "string") setTyped(text);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("garry:voice", onOpen);
    window.addEventListener("garry:idea", onIdea as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("garry:voice", onOpen);
      window.removeEventListener("garry:idea", onIdea as EventListener);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
    } else {
      recRef.current?.stop();
      setState("idle");
      setHeard("");
    }
  }, [open]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [turns, heard]);

  const speak = (text: string) => {
    setTurns((t) => [...t, { role: "garry", text }]);
    setState("speaking");
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.onend = () => setState("idle");
      window.speechSynthesis?.speak(u);
    } catch {
      setTimeout(() => setState("idle"), 1600);
    }
  };

  const respond = (text: string) => {
    const msg = text.trim();
    if (!msg) return setState("idle");
    setTurns((t) => [...t, { role: "you", text: msg }]);
    setHeard("");
    speak(`Got it. I will orchestrate "${msg}" across the affected services.`);
  };

  const startListening = () => {
    const w = window as unknown as Record<string, new () => unknown>;
    const SR = (w.SpeechRecognition || w.webkitSpeechRecognition) as
      | (new () => {
          lang: string;
          interimResults: boolean;
          onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
          onend: () => void;
          start: () => void;
          stop: () => void;
        })
      | undefined;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join("");
      heardRef.current = t;
      setHeard(t);
    };
    rec.onend = () => respond(heardRef.current);
    recRef.current = rec;
    heardRef.current = "";
    setHeard("");
    setState("listening");
    rec.start();
  };

  startRef.current = startListening;

  // Push to talk, only while the Garry dock is open: hold Space (not while typing
  // or focused on an interactive element) to record; release to send.
  useEffect(() => {
    if (!open || !supported) return;
    const blocked = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const t = el.tagName;
      return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || t === "BUTTON" || t === "A" || el.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !pttRef.current && !blocked()) {
        e.preventDefault();
        pttRef.current = true;
        startRef.current();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && pttRef.current) {
        e.preventDefault();
        pttRef.current = false;
        recRef.current?.stop();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [open, supported]);

  const onMic = () => (state === "listening" ? recRef.current?.stop() : startListening());
  const onType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typed.trim()) return;
    respond(typed);
    setTyped("");
  };

  const stateLabel =
    state === "listening" ? "Listening" : state === "speaking" ? "Garry is speaking" : "Ready";
  const SUGGESTIONS = ["What is Garry working on?", "Add dark mode to checkout", "Why did search-mfe fail?"];

  return (
    <aside
      className={`${styles.dock} ${open ? styles.open : ""}`}
      aria-hidden={!open}
      inert={!open}
      role="dialog"
      aria-label="Talk to Garry"
    >
      <div className={styles.head}>
        <div className={styles.title}>
          <GarryMark size={34} busy={state !== "idle"} />
          <div className={styles.titleText}>
            <span className={styles.name}>Garry</span>
            <span className={styles.state}>
              <span className={`dot ${state !== "idle" ? "run" : "ok"}`} />
              {stateLabel}
            </span>
          </div>
        </div>
        <button className="btn btnGhost iconBtn" onClick={() => setOpen(false)} aria-label="close">
          {Icon.close}
        </button>
      </div>

      <div className={styles.orbWrap}>
        <button
          type="button"
          className={`${styles.orb} ${state !== "idle" ? styles.orbLive : ""}`}
          onClick={onMic}
          disabled={!supported}
          aria-label={state === "listening" ? "stop listening" : "start listening"}
        >
          <Waveform bars={18} active={state !== "idle"} />
        </button>
        <div className={styles.ptt}>
          {supported ? (
            <>Hold <kbd className="kbd">Space</kbd> to talk, or type below</>
          ) : (
            <>Voice is not available in this browser. Type below.</>
          )}
        </div>
      </div>

      <div className={styles.feed} ref={feedRef} aria-live="polite">
        {turns.length === 0 && !heard && (
          <div className={styles.empty}>
            <p>Talk an idea through. Garry turns it into a feature and drives it to production.</p>
            <div className={styles.suggest}>
              {SUGGESTIONS.map((q) => (
                <button key={q} type="button" className={styles.suggestion} onClick={() => setTyped(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`${styles.turn} ${t.role === "you" ? styles.you : styles.garry}`}>{t.text}</div>
        ))}
        {heard && <div className={`${styles.turn} ${styles.you} ${styles.interim}`}>{heard}</div>}
      </div>

      <form className={styles.inputRow} onSubmit={onType}>
        <button
          type="button"
          className={`${styles.mic} ${state === "listening" ? styles.micOn : ""}`}
          onClick={onMic}
          disabled={!supported}
          aria-label="microphone"
        >
          {Icon.mic}
        </button>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Message Garry"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label="message"
        />
        <button className={styles.send} type="submit" aria-label="send" disabled={!typed.trim()}>
          {Icon.send}
        </button>
      </form>
    </aside>
  );
}
