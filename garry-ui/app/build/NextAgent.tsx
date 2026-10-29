import { useState } from "react";
import type { Thread } from "garry-client";
import { client } from "../lib/client";
import styles from "./build.module.css";

/**
 * Hand this work on to another agent: it starts in the same branch once this
 * one is done, as the next step of a chain (Build lists it under Together,
 * where more steps can be added and put in order).
 */
export default function NextAgent({ thread }: { thread: Thread }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async () => {
    try {
      await client.startChain([text], { projectId: thread.projectId, after: thread.id, name: thread.title });
      setText("");
      setNote({ ok: true, text: "Added: it starts here once this work is done (Build, Together)." });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <section className={`card ${styles.team}`} aria-label="then another agent">
      <span className="eyebrow">Then another agent</span>
      <form
        className={styles.row}
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void send();
        }}
      >
        <input className="input" aria-label="what the next agent does" placeholder="For example: write the tests for this" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" type="submit" disabled={!text.trim()}>
          Hand it on
        </button>
      </form>
      {note && <span className={`badge ${note.ok ? "ok" : "danger"}`}>{note.text}</span>}
    </section>
  );
}
