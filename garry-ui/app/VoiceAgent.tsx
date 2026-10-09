"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./voiceagent.module.css";
import Waveform from "./Waveform";

type State = "idle" | "listening" | "speaking";

/** A voice shell for talking to Garry. Uses the Web Speech API when available,
 *  with a text fallback. Front end only for now; it does not call the server. */
export default function VoiceAgent({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<State>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [typed, setTyped] = useState("");
  const recRef = useRef<{ stop: () => void } | null>(null);
  const heardRef = useRef("");

  const supported =
    typeof window !== "undefined" &&
    Boolean((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition);

  useEffect(() => {
    if (!open) {
      recRef.current?.stop();
      setState("idle");
      setHeard("");
      setReply("");
      setTyped("");
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const speak = (text: string) => {
    setReply(text);
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
    if (!text.trim()) return setState("idle");
    speak(`Got it. I will orchestrate "${text.trim()}" across the affected services.`);
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
    setHeard("");
    heardRef.current = "";
    setReply("");
    setState("listening");
    rec.start();
  };

  const onMic = () => {
    if (state === "listening") recRef.current?.stop();
    else startListening();
  };

  const onType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typed.trim()) return;
    setHeard(typed);
    respond(typed);
    setTyped("");
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <div className={styles.stage}>
          <div className={`${styles.orb} ${state !== "idle" ? styles.live : ""}`}>
            <Waveform bars={22} active={state !== "idle"} />
          </div>
        </div>

        <div className={styles.readout}>
          <div className={styles.state}>
            {state === "listening" ? "listening" : state === "speaking" ? "Garry is speaking" : "talk to Garry"}
          </div>
          <div className={styles.transcript}>{reply || heard || (supported ? "tap the mic and speak" : "type a message below")}</div>
        </div>

        <button className={`${styles.mic} ${state === "listening" ? styles.micOn : ""}`} onClick={onMic} disabled={!supported} aria-label="microphone">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0014 0M12 18v3" />
          </svg>
        </button>

        <form className={styles.typeRow} onSubmit={onType}>
          <input
            className={styles.input}
            placeholder="or type a request for Garry"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <button className={styles.send} type="submit">send</button>
        </form>
      </div>
    </div>
  );
}
