"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./skills.module.css";
import { apiBase } from "../lib/api";
import { Icon } from "../icons";
import { AuditFindings, type AuditReport } from "./AuditView";

const STAGES = ["spec", "plan", "design", "implement", "review", "test", "integrate"];

interface Preview {
  skill: { name: string; description: string; stage: string };
  files: string[];
  audit: AuditReport;
}

type Mode = "upload" | "folder";

/**
 * Install a skill locally in two steps: pick it (upload a SKILL.md, or point at a
 * folder on this machine), check the preview the server parsed, then install.
 * Nothing is written before the second step.
 */
export default function InstallSkill({ onClose, onInstalled }: { onClose: () => void; onInstalled: (name: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>("upload");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [path, setPath] = useState("");
  const [stage, setStage] = useState("");
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [ack, setAck] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const source = mode === "upload" ? { content } : { path };
  const ready = mode === "upload" ? Boolean(content) : Boolean(path.trim());

  const call = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/api/skills/install`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...source, stage: stage || undefined, replace, dryRun, acknowledge: ack }),
      });
      const d = await r.json();
      if (!r.ok) {
        setPreview(null);
        setError(d.error ?? "the skill could not be read");
        return;
      }
      if (dryRun) setPreview(d as Preview);
      else onInstalled((d as Preview).skill.name);
    } catch {
      setError("cannot reach garry-server");
    } finally {
      setBusy(false);
    }
  };

  // re-check whenever the source or the stage changes, so the preview never goes stale
  useEffect(() => {
    setPreview(null);
    setAck(false);
    if (!ready) return;
    const t = setTimeout(() => void call(true), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, path, stage, replace, mode]);

  const readFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200_000) return setError("SKILL.md is larger than 200 kB");
    setFileName(f.name);
    f.text().then(setContent);
  };

  const exists = error?.includes("already installed");

  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="install-title">
      <form method="dialog" className={styles.dialogHead}>
        <h2 id="install-title">Install a skill</h2>
        <button className="btn btnGhost iconBtn" aria-label="close">{Icon.close}</button>
      </form>

      <div className={styles.dialogBody}>
        <p className={styles.help}>
          A skill is a folder with a <code>SKILL.md</code>: YAML frontmatter with <code>name</code> and{" "}
          <code>description</code> (and optionally <code>stage</code>), then the instructions for the agent. It is
          installed on this machine only and joins its stage in every feature&apos;s plan.
        </p>

        <div className={styles.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={mode === "upload"} onClick={() => setMode("upload")}>
            Upload SKILL.md
          </button>
          <button type="button" role="tab" aria-selected={mode === "folder"} onClick={() => setMode("folder")}>
            From a folder
          </button>
        </div>

        {mode === "upload" ? (
          <label
            className={`${styles.drop} ${drag ? styles.dropOn : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              readFile(e.dataTransfer.files[0]);
            }}
          >
            <input type="file" accept=".md,text/markdown" onChange={(e) => readFile(e.target.files?.[0])} />
            <span className={styles.dropIcon}>{Icon.inbox}</span>
            <span>
              {fileName ? <b>{fileName}</b> : <>Drop a <b>SKILL.md</b> here, or click to choose one</>}
            </span>
          </label>
        ) : (
          <label className={styles.field}>
            <span>Folder (or its SKILL.md) on the machine running garry-server</span>
            <input
              className="input"
              placeholder="~/skills/a11y-audit"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              spellCheck={false}
            />
            <span className={styles.hint}>Copies SKILL.md and the files next to it (no symlinks, up to 50 files, 2 MB).</span>
          </label>
        )}

        <label className={styles.field}>
          <span>Stage</span>
          <select className="select" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">From the SKILL.md frontmatter</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {error && (
          <div className={styles.error} role="alert">
            {Icon.alert}
            <span>{error}</span>
          </div>
        )}
        {exists && (
          <label className={styles.check}>
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Replace the installed one
          </label>
        )}

        {preview && (
          <div className={styles.preview}>
            <div className={styles.previewHead}>
              <span className={styles.previewName}>{preview.skill.name}</span>
              <span className="badge">{preview.skill.stage}</span>
              <span className={`badge ${styles.mine}`}>Local</span>
            </div>
            <p>{preview.skill.description}</p>
            <span className={styles.hint}>
              {preview.files.length} {preview.files.length === 1 ? "file" : "files"}: {preview.files.slice(0, 6).join(", ")}
              {preview.files.length > 6 ? ", ..." : ""}
            </span>
          </div>
        )}

        {preview && <AuditFindings audit={preview.audit} />}
        {preview?.audit.verdict === "fail" && (
          <p className={styles.help}>
            This skill cannot be installed. Remove what the audit found from the skill, then try again.
          </p>
        )}
        {preview?.audit.verdict === "warn" && (
          <label className={styles.check}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            I have read these warnings and trust this skill
          </label>
        )}
      </div>

      <div className={styles.dialogFoot}>
        <button type="button" className="btn btnGhost" onClick={() => ref.current?.close()}>Cancel</button>
        <button
          type="button"
          className="btn btnPrimary"
          disabled={!preview || busy || preview.audit.verdict === "fail" || (preview.audit.verdict === "warn" && !ack)}
          onClick={() => void call(false)}
        >
          {busy ? "Checking..." : preview?.audit.verdict === "fail" ? "Blocked" : "Install"}
        </button>
      </div>
    </dialog>
  );
}
