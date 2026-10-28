import { useEffect, useState } from "react";
import type { ArchIssue, Architecture, ArchitectureState, WizardAnswers } from "garry-client";
import { client } from "../lib/client";
import styles from "./wizard.module.css";

const DEFAULTS: WizardAnswers = { clients: ["web"], platform: "vercel", data: "sql", extras: [], services: true };
type Step = "clients" | "platform" | "data" | "extras" | "review";
const STEPS: Step[] = ["clients", "platform", "data", "extras", "review"];

/**
 * The architecture, step by step: who uses it, where it runs, what data it
 * keeps, what else it needs. The answers build a board from the same blocks as
 * by hand; they are kept with the board, so the wizard opens with them again
 * and a change rebuilds it.
 */
export default function Wizard({ state, boardName, onBuilt, onClose }: { state: ArchitectureState; boardName: string; onBuilt: (a: Architecture) => Promise<void>; onClose?: () => void }) {
  const [answers, setAnswers] = useState<WizardAnswers>(state.architecture.wizard ?? DEFAULTS);
  const [step, setStep] = useState<Step>("clients");
  const [preview, setPreview] = useState<{ architecture: Architecture; issues: ArchIssue[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = state.wizard;
  const at = STEPS.indexOf(step);
  const blocks = new Map([...state.components, ...state.services].map((b) => [b.id, b]));

  // the review shows the board the answers make, before anything is saved
  useEffect(() => {
    if (step !== "review") return;
    setPreview(null);
    setError(null);
    client.wizardArchitecture(answers).then(setPreview, (e) => setError(String((e as Error).message ?? e)));
  }, [step, answers]);

  const toggle = <K extends "clients" | "extras">(key: K, id: WizardAnswers[K][number]) =>
    setAnswers((a) => {
      const list = a[key] as string[];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      return { ...a, [key]: next };
    });
  const ready = step !== "clients" || answers.clients.length > 0;

  const build = async () => {
    if (!preview) return;
    const filled = state.architecture.nodes.length;
    if (filled && !window.confirm(`Rebuild the ${boardName} board from these answers? The ${filled} blocks on it now are replaced.`)) return;
    setBusy(true);
    try {
      await onBuilt(preview.architecture);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const choice = (key: "clients" | "platform" | "data" | "extras") => {
    const multi = key === "clients" || key === "extras";
    return (
      <div className={styles.choices} role={multi ? "group" : "radiogroup"} aria-label={q[key].title}>
        {q[key].choices.map((c) => {
          const on = multi ? (answers[key] as string[]).includes(c.id) : answers[key] === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={on}
              className={`${styles.choice} ${on ? styles.on : ""}`}
              onClick={() => (multi ? toggle(key as "clients" | "extras", c.id as never) : setAnswers((a) => ({ ...a, [key]: c.id })))}
            >
              <span className={styles.check} aria-hidden="true">{on ? "✓" : ""}</span>
              <span className={styles.choiceText}>
                <span className={styles.choiceLabel}>{c.label}</span>
                <span className={styles.choiceHint}>{c.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <section className={`card ${styles.wizard}`} aria-label="architecture wizard">
      <div className={styles.head}>
        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" className={`${styles.stepDot} ${s === step ? styles.stepOn : ""} ${i < at ? styles.stepDone : ""}`} onClick={() => (i <= at || answers.clients.length ? setStep(s) : undefined)} aria-current={s === step ? "step" : undefined}>
                <span>{i + 1}</span>
                {s === "review" ? "Review" : q[s].title.replace("?", "")}
              </button>
            </li>
          ))}
        </ol>
        {onClose && (
          <button className="btn btnSm btnGhost" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      {step !== "review" ? (
        <>
          <h2 className={styles.title}>{q[step].title}</h2>
          {(step === "clients" || step === "extras") && <p className={styles.sub}>Pick all that apply.</p>}
          {choice(step)}
          {step === "extras" && (
            <label className={styles.services}>
              <input type="checkbox" checked={answers.services} onChange={(e) => setAnswers((a) => ({ ...a, services: e.target.checked }))} />
              Put the services from the registry on the board too ({state.services.length})
            </label>
          )}
        </>
      ) : (
        <div className={styles.review}>
          <h2 className={styles.title}>The {boardName} board these answers make</h2>
          {error && <p className="badge danger">{error}</p>}
          {!preview && !error && <p className={styles.sub}>Working it out…</p>}
          {preview && (
            <>
              <ul className={styles.blocks}>
                {preview.architecture.nodes.map((n) => (
                  <li key={n.id} className="chip">
                    {n.label ? `${n.label} · ` : ""}
                    {blocks.get(n.block)?.name ?? n.block.replace(/^service:/, "")}
                  </li>
                ))}
              </ul>
              <p className={styles.sub}>
                {preview.architecture.nodes.length} blocks, {preview.architecture.edges.length} links
                {preview.issues.some((i) => i.level === "error") ? ". Something does not fit; it shows on the board." : ". Everything fits. You can change the board by hand afterwards, or come back here."}
              </p>
            </>
          )}
        </div>
      )}

      <div className={styles.actions}>
        {at > 0 && (
          <button className="btn" onClick={() => setStep(STEPS[at - 1])}>
            Back
          </button>
        )}
        {step !== "review" ? (
          <button className="btn btnPrimary" disabled={!ready} onClick={() => setStep(STEPS[at + 1])}>
            Next
          </button>
        ) : (
          <button className="btn btnPrimary" disabled={!preview || busy} onClick={() => void build()}>
            {busy ? "Building…" : state.architecture.nodes.length ? "Rebuild the board" : "Build the board"}
          </button>
        )}
        {step === "clients" && !answers.clients.length && <span className={styles.sub}>Pick at least one.</span>}
      </div>
    </section>
  );
}
