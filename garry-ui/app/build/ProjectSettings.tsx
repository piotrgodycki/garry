import { useEffect, useState } from "react";
import { GarryError, type ProjectSettings } from "garry-client";
import { client } from "../lib/client";
import styles from "./build.module.css";
import GithubHome from "./GithubHome";

const MODES: { id: ProjectSettings["push"]; label: string; hint: string }[] = [
  { id: "ask", label: "Ask first", hint: "Garry shows the branch, the remote and the commits and waits for your yes." },
  { id: "allow", label: "Allow", hint: "Opening a pull request pushes straight away." },
  { id: "never", label: "Never", hint: "Nothing leaves this computer; push by hand." },
];

/** What Garry may do with one project's remote: pushing, branches, pull requests. */
export default function ProjectSettingsPanel({ projectId }: { projectId: string }) {
  const [saved, setSaved] = useState<ProjectSettings | null>(null);
  const [draft, setDraft] = useState<ProjectSettings | null>(null);
  const [protectedText, setProtectedText] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setNote(null);
    client.projectSettings(projectId).then(
      (s) => {
        setSaved(s);
        setDraft(s);
        setProtectedText(s.protectedBranches.join(", "));
      },
      (e) => setNote({ ok: false, text: String((e as Error).message ?? e) }),
    );
  }, [projectId]);

  if (!draft || !saved) return note ? <span className="badge danger">{note.text}</span> : null;
  const set = (patch: Partial<ProjectSettings>) => setDraft({ ...draft, ...patch });
  const changed = JSON.stringify({ ...draft, protectedBranches: protectedText }) !== JSON.stringify({ ...saved, protectedBranches: saved.protectedBranches.join(", ") });

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const s = await client.saveProjectSettings(projectId, { ...draft, protectedBranches: protectedText.split(",").map((x) => x.trim()).filter(Boolean) });
      setSaved(s);
      setDraft(s);
      setProtectedText(s.protectedBranches.join(", "));
      setNote({ ok: true, text: "Saved" });
    } catch (e) {
      if (e instanceof GarryError && e.status === 403) setReadOnly(true);
      setNote({ ok: false, text: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.settings}>
      <GithubHome projectId={projectId} />
      <fieldset className={styles.field} disabled={readOnly}>
        <legend className="fieldLabel">Pushing</legend>
        <div className={styles.segmented} role="radiogroup" aria-label="Pushing">
          {MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={draft.push === m.id} className={draft.push === m.id ? styles.segOn : ""} onClick={() => set({ push: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
        <span className={styles.meta}>{MODES.find((m) => m.id === draft.push)?.hint}</span>
      </fieldset>
      <label className={styles.field}>
        <span className="fieldLabel">Pull requests into</span>
        <input className="input" disabled={readOnly} placeholder="Empty: the repository's default branch" value={draft.baseBranch} onChange={(e) => set({ baseBranch: e.target.value })} />
      </label>
      <label className={styles.field}>
        <span className="fieldLabel">Branch prefix</span>
        <input className="input" disabled={readOnly} value={draft.branchPrefix} onChange={(e) => set({ branchPrefix: e.target.value })} />
        <span className={styles.meta}>
          New work: {draft.branchPrefix}add-dark-mode-x1y2
        </span>
      </label>
      <label className={styles.field}>
        <span className="fieldLabel">Protected branches</span>
        <input className="input" disabled={readOnly} value={protectedText} onChange={(e) => setProtectedText(e.target.value)} />
        <span className={styles.meta}>Never pushed to, even with a yes. Comma separated, * matches anything.</span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" disabled={readOnly} checked={draft.draftPr} onChange={(e) => set({ draftPr: e.target.checked })} />
        Open pull requests as drafts
      </label>
      <label className={styles.field}>
        <span className="fieldLabel">Largest file an agent may commit</span>
        <input
          className="input"
          type="number"
          min={0}
          step={500}
          disabled={readOnly}
          aria-label="largest file in tokens"
          value={draft.maxFileTokens ?? 5000}
          onChange={(e) => set({ maxFileTokens: Number(e.target.value) })}
        />
        <span className={styles.meta}>In tokens (bytes / 4). A commit with a bigger file is refused with how to split it, so agents can read every file whole. 0 turns it off.</span>
      </label>
      <div className={styles.row}>
        {!readOnly && (
          <button className="btn btnPrimary" disabled={!changed || busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        )}
        {readOnly && <span className={styles.meta}>Settings are changed on the computer running Garry.</span>}
        {note && <span className={`badge ${note.ok ? "ok" : "danger"}`}>{note.text}</span>}
      </div>
    </div>
  );
}
