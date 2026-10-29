import styles from "./build.module.css";
import { Icon } from "../icons";

export type Mode = "one" | "pair" | "chain";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "one", label: "One agent", hint: "An agent works on it in its own branch." },
  { id: "pair", label: "With a reviewer", hint: "One agent writes; each time it finishes a reviewer checks the changes and asks for fixes until it approves." },
  { id: "chain", label: "A chain", hint: "Steps in your order, each its own agent in the same branch; the next starts when the one before is done." },
];

/** How the agents work on what you describe: alone, in a pair with a reviewer, or as a chain of steps. */
export function ModePicker({ mode, onMode, rounds, onRounds }: { mode: Mode; onMode: (m: Mode) => void; rounds: number; onRounds: (n: number) => void }) {
  return (
    <div className={styles.modes}>
      <div className={styles.segmented} role="radiogroup" aria-label="how agents work">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={mode === m.id ? styles.segOn : ""} onClick={() => onMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <span className={styles.meta}>{MODES.find((m) => m.id === mode)?.hint}</span>
      {mode === "pair" && (
        <label className={styles.rounds}>
          Review rounds
          <select className="input" aria-label="review rounds" value={rounds} onChange={(e) => onRounds(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** The chain's steps after the first (the first is the main field): in order, each movable and removable. */
export function ChainSteps({ steps, onSteps }: { steps: string[]; onSteps: (s: string[]) => void }) {
  const set = (i: number, v: string) => onSteps(steps.map((s, k) => (k === i ? v : s)));
  const move = (i: number, by: number) => {
    const next = [...steps];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onSteps(next);
  };
  return (
    <ol className={styles.steps} aria-label="the chain's next steps" start={2}>
      {steps.map((s, i) => (
        <li key={i} className={styles.step}>
          <span className={styles.stepNo} aria-hidden="true">
            {i + 2}
          </span>
          <input className="input" aria-label={`step ${i + 2}`} placeholder="What the next agent does with that work" value={s} onChange={(e) => set(i, e.target.value)} />
          <button type="button" className="btn btnSm btnGhost" aria-label={`move step ${i + 2} up`} disabled={i === 0} onClick={() => move(i, -1)}>
            ↑
          </button>
          <button type="button" className="btn btnSm btnGhost" aria-label={`move step ${i + 2} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
            ↓
          </button>
          <button type="button" className="btn btnSm btnGhost" aria-label={`remove step ${i + 2}`} onClick={() => onSteps(steps.filter((_, k) => k !== i))}>
            {Icon.close}
          </button>
        </li>
      ))}
      <li>
        <button type="button" className="btn btnSm" onClick={() => onSteps([...steps, ""])}>
          Add a step
        </button>
      </li>
    </ol>
  );
}
