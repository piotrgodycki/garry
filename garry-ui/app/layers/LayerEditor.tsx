import { useState } from "react";
import type { Layer, LayerScope, Layers, SkillSummary, Stack } from "garry-client";
import Link from "../lib/router";
import styles from "./layers.module.css";

export const EMPTY: Layer = { skills: [], skillsOff: [], stacks: [], notes: "" };

/**
 * The skills a layer starts from, before its own changes, and where each one
 * comes from: every project, then the project's layer, then the repository's.
 */
export function inheritedSkills(layers: Layers, skills: SkillSummary[], scope: LayerScope, repo: string | null): Map<string, string> {
  const on = new Map<string, string>();
  for (const s of skills) if (s.everywhere) on.set(s.name, "every project");
  if (scope.level === "project") return on;
  layers.project.skills.forEach((n) => on.has(n) || on.set(n, "the project"));
  layers.project.skillsOff.forEach((n) => on.delete(n));
  if (scope.level === "service" && repo) {
    const r = layers.repos[repo];
    r?.skills.forEach((n) => on.has(n) || on.set(n, `repository ${repo}`));
    r?.skillsOff.forEach((n) => on.delete(n));
  }
  return on;
}

const TITLE = { project: "Project", repo: "Repository", service: "Service" } as const;

/** One layer: its skills (on, or off again), its stacks and its notes. */
export default function LayerEditor(props: {
  scope: LayerScope;
  layer: Layer;
  inherited: Map<string, string>;
  skills: SkillSummary[];
  stacks: Stack[];
  projectStacks: string[];
  builtWith: string | null;
  serviceRepo: string | null;
  onSave: (l: Layer) => Promise<void>;
}) {
  const { scope, inherited } = props;
  const [layer, setLayer] = useState<Layer>(props.layer);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(() => props.skills.some((s) => s.source !== "local" && (props.layer.skills.includes(s.name) || props.inherited.has(s.name))));
  const dirty = JSON.stringify(layer) !== JSON.stringify(props.layer);
  const name = scope.level === "project" ? "" : scope.name;

  const isOn = (n: string) => (inherited.has(n) ? !layer.skillsOff.includes(n) : layer.skills.includes(n));
  const toggle = (n: string, on: boolean) => {
    const skills = layer.skills.filter((x) => x !== n);
    const skillsOff = layer.skillsOff.filter((x) => x !== n);
    if (on && !inherited.has(n)) skills.push(n);
    if (!on && inherited.has(n)) skillsOff.push(n);
    setLayer({ ...layer, skills, skillsOff });
    setSaved(null);
  };
  const toggleStack = (n: string, on: boolean) => {
    setLayer({ ...layer, stacks: on ? [...layer.stacks, n] : layer.stacks.filter((x) => x !== n) });
    setSaved(null);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await props.onSave(layer);
      setSaved("Saved. Agents get it from their next message.");
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const mine = props.skills.filter((s) => s.source === "local");
  const pipeline = props.skills.filter((s) => s.source !== "local");
  // folded away unless one of them is on here
  const list = (items: SkillSummary[]) => (
    <ul className={styles.skills}>
      {items.map((s) => (
        <li key={s.name}>
          <label className={styles.skill}>
            <input type="checkbox" checked={isOn(s.name)} onChange={(e) => toggle(s.name, e.target.checked)} />
            <span className={styles.skillText}>
              <b>{s.name}</b>
              <span>{s.summary}</span>
            </span>
            <span className={styles.from}>{inherited.has(s.name) ? (isOn(s.name) ? `from ${inherited.get(s.name)}` : "turned off here") : isOn(s.name) ? "on here" : ""}</span>
          </label>
        </li>
      ))}
    </ul>
  );

  const help =
    scope.level === "project"
      ? "Every agent in this project gets what you set here."
      : scope.level === "repo"
        ? "Agents in this repository get the project's layer, plus what you change here."
        : props.serviceRepo
          ? `Added for agents in ${props.serviceRepo}, the repository this service lives in.`
          : "Add the service's repository in Build so its agents get this.";

  return (
    <section className={`card ${styles.editor}`} aria-labelledby="layer-title">
      <header className={styles.editorHead}>
        <span className={styles.level}>{TITLE[scope.level]}</span>
        <h2 id="layer-title" className={styles.title}>
          {name || "Whole project"}
        </h2>
        <p className={styles.help}>{help}</p>
      </header>

      <fieldset className={styles.field}>
        <legend className={styles.label}>Skills</legend>
        {props.skills.length === 0 ? (
          <p className={styles.help}>
            No skills to give yet. <Link href="/skills">Add one in Skills</Link>.
          </p>
        ) : (
          <>
            {mine.length > 0 ? list(mine) : <p className={styles.help}>No skills of your own yet. <Link href="/skills">Install one in Skills</Link>.</p>}
            {pipeline.length > 0 && (
              <details className={styles.more} open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
                <summary>Garry&apos;s pipeline skills ({pipeline.length})</summary>
                {more && (
                  <>
                    <p className={styles.help}>The feature pipeline uses these. Turn one on to give it to agents in Build too.</p>
                    {list(pipeline)}
                  </>
                )}
              </details>
            )}
          </>
        )}
        {layer.skills
          .filter((n) => !props.skills.some((s) => s.name === n))
          .map((n) => (
            <span key={n} className="badge warn">
              {n} is turned on here but not installed
            </span>
          ))}
      </fieldset>

      <fieldset className={styles.field}>
        <legend className={styles.label}>Stacks</legend>
        <p className={styles.help}>
          {scope.level === "project"
            ? "What the code is built with, unless a repository says otherwise."
            : scope.level === "repo"
              ? props.projectStacks.length
                ? `Leave all off to keep the project's: ${props.projectStacks.join(", ")}.`
                : "The project names no stacks."
              : props.builtWith
                ? `Built with ${props.builtWith} (set on the service). Pick more if it uses them.`
                : "Pick the stacks this service is built with."}
        </p>
        {props.stacks.length === 0 ? (
          <p className={styles.help}>
            No stacks yet. <Link href="/stacks">Make one in Stacks</Link>.
          </p>
        ) : (
          <div className={styles.chips}>
            {props.stacks.map((st) => (
              <label key={st.name} className={styles.chip}>
                <input type="checkbox" checked={layer.stacks.includes(st.name)} onChange={(e) => toggleStack(st.name, e.target.checked)} />
                {st.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="layer-notes">
          Notes for the agents
        </label>
        <textarea
          id="layer-notes"
          className={`input ${styles.notes}`}
          placeholder="e.g. Write in British English. Run the tests before you finish."
          value={layer.notes}
          maxLength={4000}
          onChange={(e) => {
            setLayer({ ...layer, notes: e.target.value });
            setSaved(null);
          }}
        />
        <span className={styles.help}>House rules, things to avoid, how to test. The agent reads them before it starts.</span>
      </div>

      <div className={styles.actions}>
        <button className="btn btnPrimary" disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save the layer"}
        </button>
        {dirty && (
          <button className="btn btnGhost" onClick={() => setLayer(props.layer)}>
            Undo changes
          </button>
        )}
        {saved && !dirty && (
          <span className={styles.help} role="status">
            {saved}
          </span>
        )}
        {error && (
          <span className="badge danger" role="alert">
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
