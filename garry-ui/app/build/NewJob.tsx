import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { Project } from "garry-client";
import { client } from "../lib/client";
import { confirmAction } from "../lib/desktop";
import { Icon } from "../icons";
import Select from "../Select";
import ProjectSettingsPanel from "./ProjectSettings";
import styles from "./jobs.module.css";

export type Mode = "one" | "pair" | "chain";

const MODES: { id: Mode; title: string; text: string; icon: ReactNode }[] = [
  { id: "one", title: "One agent", text: "An agent makes the change on its own branch.", icon: Icon.agent },
  { id: "pair", title: "Agent and reviewer", text: "A second agent checks the work and asks for fixes until it is right.", icon: Icon.check },
  { id: "chain", title: "Several steps", text: "Agents one after another, each one carrying on from the last.", icon: Icon.code },
];

/**
 * Start a job: the repository it is in, what should change, and who works on
 * it (one agent, an agent with a reviewer, or several steps in order).
 */
export default function NewJob({ projects, task, onStarted }: { projects: Project[]; task: string; onStarted: () => void }) {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [prompt, setPrompt] = useState(task);
  const [mode, setMode] = useState<Mode>("one");
  const [rounds, setRounds] = useState(3);
  const [steps, setSteps] = useState<string[]>([""]);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repo = projects.find((p) => p.id === projectId) ? projectId : (projects[0]?.id ?? "");

  const start = async () => {
    if (!(await confirmAction("start new work in Garry"))) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "pair") {
        const p = await client.startPair(prompt, repo, rounds);
        navigate(`/build/${p.writer}`);
      } else if (mode === "chain") {
        await client.startChain([prompt, ...steps.map((x) => x.trim()).filter(Boolean)], { projectId: repo });
        setPrompt("");
        setSteps([""]);
        onStarted();
      } else {
        const t = await client.createThread(repo, prompt);
        navigate(`/build/${t.id}`);
      }
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };
  const setStep = (i: number, v: string) => setSteps(steps.map((s, k) => (k === i ? v : s)));
  const moveStep = (i: number, by: number) => {
    const next = [...steps];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setSteps(next);
  };

  return (
    <section className={`card ${styles.newJob}`} aria-labelledby="new-job">
      <h2 id="new-job" className={styles.cardTitle}>
        Start a job
      </h2>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="job-repo">
          Repository
        </label>
        <div className={styles.repoRow}>
          {projects.length > 1 ? (
            <Select id="job-repo" ariaLabel="repository" value={repo} onChange={setProjectId} options={projects.map((p) => ({ value: p.id, label: p.name, hint: p.path }))} />
          ) : (
            <span id="job-repo" className={styles.repoName} title={projects[0]?.path}>
              {projects[0]?.name}
            </span>
          )}
          <button type="button" className="btn btnSm btnGhost" aria-expanded={settings} onClick={() => setSettings(!settings)}>
            {Icon.settings}
            Branch and push settings
          </button>
        </div>
        {settings && repo && <ProjectSettingsPanel projectId={repo} />}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="job-prompt">
          {mode === "chain" ? "Step 1: what should change first?" : "What should change?"}
        </label>
        <textarea
          id="job-prompt"
          className={`input ${styles.prompt}`}
          placeholder="e.g. Add a dark mode switch to the settings page"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && prompt.trim() && !busy) void start();
          }}
        />
        <span className={styles.help}>Describe it as you would to a colleague. One change per job works best.</span>
      </div>

      <fieldset className={styles.field}>
        <legend className={styles.label}>Who works on it</legend>
        <div className={styles.modes} role="radiogroup" aria-label="who works on it">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={styles.mode} onClick={() => setMode(m.id)}>
              <span className={styles.modeIcon} aria-hidden="true">
                {m.icon}
              </span>
              <b>{m.title}</b>
              <span>{m.text}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {mode === "pair" && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="job-rounds">
            Review rounds
          </label>
          <select id="job-rounds" className={`input ${styles.small}`} aria-label="review rounds" value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "1 round" : `${n} rounds`}
              </option>
            ))}
          </select>
          <span className={styles.help}>After this many reviews without approval, the job waits for you.</span>
        </div>
      )}

      {mode === "chain" && (
        <div className={styles.field}>
          <span className={styles.label}>Then</span>
          <ol className={styles.steps} aria-label="the next steps">
            {steps.map((s, i) => (
              <li key={i}>
                <span className={styles.stepNo} aria-hidden="true">
                  {i + 2}
                </span>
                <input className="input" aria-label={`step ${i + 2}`} placeholder="e.g. Write tests for it" value={s} onChange={(e) => setStep(i, e.target.value)} />
                <button type="button" className="btn btnSm btnGhost" aria-label={`move step ${i + 2} up`} disabled={i === 0} onClick={() => moveStep(i, -1)}>
                  ↑
                </button>
                <button type="button" className="btn btnSm btnGhost" aria-label={`move step ${i + 2} down`} disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)}>
                  ↓
                </button>
                <button type="button" className="btn btnSm btnGhost" aria-label={`remove step ${i + 2}`} onClick={() => setSteps(steps.filter((_, k) => k !== i))}>
                  {Icon.close}
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btnSm" onClick={() => setSteps([...steps, ""])}>
            Add a step
          </button>
        </div>
      )}

      <div className={styles.startRow}>
        <button className="btn btnPrimary" disabled={!prompt.trim() || !repo || busy} onClick={() => void start()}>
          {busy ? "Starting…" : "Start the job"}
        </button>
        <span className={styles.help}>Nothing changes in your repository until you commit. ⌘ Enter starts it too.</span>
        {error && (
          <span className="badge danger" role="alert">
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
