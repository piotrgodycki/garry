import { useEffect, useRef, useState } from "react";
import styles from "./skills.module.css";
import { apiBase } from "../lib/api";
import { Icon } from "../icons";
import { AuditFindings, type AuditReport } from "./AuditView";
import Select from "../Select";
import { client } from "../lib/client";

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
export interface ProposeInfo {
  repo: string | null;
  ready: boolean;
}

export default function InstallSkill({
  onClose,
  onInstalled,
  policy,
  propose,
}: {
  onClose: () => void;
  onInstalled: (name: string) => void;
  /** "ci-only" turns local installs off: skills only arrive through a reviewed pull request */
  policy: "local" | "ci-only";
  propose: ProposeInfo;
}) {
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
  const [proposed, setProposed] = useState<{ url: string; number: number; branch: string } | null>(null);
  // who gets it: every project, or one layer of this one (the project, a repository, a service)
  const [who, setWho] = useState("everywhere");
  const [places, setPlaces] = useState<{ value: string; label: string; hint?: string }[]>([]);
  useEffect(() => {
    client.layers().then(
      (d) =>
        setPlaces([
          ...d.repos.map((r) => ({ value: `repo:${r.name}`, label: `Repository ${r.name}`, hint: "agents in it" })),
          ...d.services.map((s) => ({ value: `service:${s.name}`, label: `Service ${s.name}`, hint: s.inRepo ? `in ${s.inRepo}` : undefined })),
        ]),
      () => undefined,
    );
  }, []);
  const scope = who === "everywhere" ? undefined : who === "project" ? { level: "project" } : { level: who.slice(0, who.indexOf(":")), name: who.slice(who.indexOf(":") + 1) };

  const doPropose = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/api/skills/propose`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...source, stage: stage || undefined, acknowledge: ack }),
      });
      const d = await r.json();
      if (!r.ok) return setError(d.error ?? "the pull request could not be opened");
      setProposed(d as { url: string; number: number; branch: string });
    } catch {
      setError("cannot reach garry-server");
    } finally {
      setBusy(false);
    }
  };

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
        body: JSON.stringify({ ...source, stage: stage || undefined, replace, dryRun, acknowledge: ack, scope }),
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
        <h2 id="install-title">{policy === "ci-only" ? "Propose a skill" : "Add a skill"}</h2>
        <button className="btn btnGhost iconBtn" aria-label="close">{Icon.close}</button>
      </form>

      <div className={styles.dialogBody}>
        <p className={styles.help}>
          A skill is a folder with a <code>SKILL.md</code>: YAML frontmatter with <code>name</code> and{" "}
          <code>description</code> (and optionally <code>stage</code>), then the instructions for the agent. It is
          audited first. <b>Install locally</b> adds it on this machine only. <b>Propose to team</b> opens a pull request
          {propose.repo ? <> to <code>{propose.repo}</code></> : null}: CI audits it again with a secret scanner and
          Semgrep, a code owner reviews it, and after the merge every teammate gets it pre-installed.
        </p>
        {policy === "ci-only" && (
          <p className={styles.policy}>Local installs are turned off for this team: skills only arrive through a reviewed pull request.</p>
        )}
        {proposed && (
          <div className={styles.proposed} role="status">
            {Icon.check}
            <div>
              <b>Pull request #{proposed.number} opened</b>
              <span>
                The skill-audit check and a code owner review it now. <a href={proposed.url} target="_blank" rel="noopener noreferrer">Open it on GitHub</a>
              </span>
            </div>
          </div>
        )}

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
              placeholder="e.g. ~/skills/a11y-audit"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              spellCheck={false}
            />
            <span className={styles.hint}>Copies SKILL.md and the files next to it (no symlinks, up to 50 files, 2 MB).</span>
          </label>
        )}

        {policy !== "ci-only" && (
          <label className={styles.field}>
            <span>Who gets it</span>
            <Select
              ariaLabel="who gets the skill"
              value={who}
              onChange={setWho}
              options={[{ value: "everywhere", label: "Agents in every project" }, { value: "project", label: "This project only" }, ...places]}
            />
            <span className={styles.hint}>You can change it later in Layers.</span>
          </label>
        )}

        <label className={styles.field}>
          <span>Stage</span>
          <Select ariaLabel="stage" value={stage} onChange={setStage} options={[{ value: "", label: "From the SKILL.md frontmatter" }, ...STAGES.map((s) => ({ value: s, label: s }))]} />
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
        {!propose.ready && preview && preview.audit.verdict !== "fail" && (
          <p className={styles.hint}>To propose it to the team, add GARRY_GITHUB_TOKEN to .env.local and restart the server.</p>
        )}
        {preview?.audit.verdict === "warn" && (
          <label className={styles.check}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            I have read these warnings and trust this skill
          </label>
        )}
      </div>

      <div className={styles.dialogFoot}>
        <button type="button" className="btn btnGhost" onClick={() => ref.current?.close()}>
          {proposed ? "Close" : "Cancel"}
        </button>
        {!proposed && (
          <>
            <button
              type="button"
              className={`btn ${policy === "ci-only" ? "btnPrimary" : ""}`}
              disabled={!preview || busy || !propose.ready || preview.audit.verdict === "fail" || (preview.audit.verdict === "warn" && !ack)}
              title={propose.ready ? "Open a pull request so CI and a code owner review it for the whole team" : "Set GARRY_GITHUB_TOKEN in .env.local to open pull requests"}
              onClick={() => void doPropose()}
            >
              {Icon.prs}
              Propose to team
            </button>
            {policy !== "ci-only" && (
              <button
                type="button"
                className="btn btnPrimary"
                disabled={!preview || busy || preview.audit.verdict === "fail" || (preview.audit.verdict === "warn" && !ack)}
                onClick={() => void call(false)}
              >
                {busy ? "Checking..." : preview?.audit.verdict === "fail" ? "Blocked" : "Install locally"}
              </button>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
