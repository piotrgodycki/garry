import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../panel.module.css";
import s2 from "./skills.module.css";
import { apiBase } from "../lib/api";
import { Icon } from "../icons";
import { Empty, PageHeader, ServerNotice, Skeleton } from "../ui";
import InstallSkill, { type ProposeInfo } from "./InstallSkill";
import { AuditBadge, AuditFindings, type AuditReport } from "./AuditView";

interface Skill {
  name: string;
  stage: string;
  summary: string;
  source: "builtin" | "local";
  hasDoc: boolean;
  audit: AuditReport | null;
}

type Filter = "all" | "builtin" | "local";
const STAGE_ORDER = ["spec", "plan", "design", "implement", "review", "test", "integrate"];

export default function Skills() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [localDir, setLocalDir] = useState("");
  const [policy, setPolicy] = useState<"local" | "ci-only">("local");
  const [propose, setPropose] = useState<ProposeInfo>({ repo: null, ready: false });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [installing, setInstalling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, string | null>>({});
  const [auditOpen, setAuditOpen] = useState<string | null>(null);
  const [audits, setAudits] = useState<Record<string, AuditReport | null>>({});

  const toggleAudit = async (name: string) => {
    if (auditOpen === name) return setAuditOpen(null);
    setAuditOpen(name);
    const d = await fetch(`${apiBase}/api/skills/${encodeURIComponent(name)}/audit`).then((r) => r.json()).catch(() => ({}));
    setAudits((m) => ({ ...m, [name]: (d as { audit?: AuditReport | null }).audit ?? null }));
  };

  const load = useCallback(() => {
    fetch(`${apiBase}/api/skills`)
      .then((r) => r.json())
      .then((d) => {
        setSkills(d.skills as Skill[]);
        setLocalDir((d.localDir as string) ?? "");
        setPolicy(d.policy === "ci-only" ? "ci-only" : "local");
        setPropose((d.propose as ProposeInfo) ?? { repo: null, ready: false });
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);
  useEffect(() => load(), [load]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 4000);
  };

  const remove = async (name: string) => {
    if (!window.confirm(`Remove the local skill "${name}"? Agents stop using it in the next plan.`)) return;
    const r = await fetch(`${apiBase}/api/skills/${encodeURIComponent(name)}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) return flash(d.error ?? "could not remove the skill");
    flash(`Removed ${name}`);
    load();
  };

  const toggleDoc = async (name: string) => {
    if (open === name) return setOpen(null);
    setOpen(name);
    if (name in docs) return;
    const d = await fetch(`${apiBase}/api/skills/${encodeURIComponent(name)}/doc`).then((r) => r.json()).catch(() => ({}));
    setDocs((m) => ({ ...m, [name]: (d as { doc?: string | null }).doc ?? null }));
  };

  const counts = useMemo(
    () => ({
      all: skills?.length ?? 0,
      builtin: skills?.filter((s) => s.source === "builtin").length ?? 0,
      local: skills?.filter((s) => s.source === "local").length ?? 0,
    }),
    [skills],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (skills ?? []).filter(
      (s) =>
        (filter === "all" || s.source === filter) &&
        (!q || s.name.includes(q) || s.summary.toLowerCase().includes(q) || s.stage.includes(q)),
    );
  }, [skills, query, filter]);
  const stages = STAGE_ORDER.filter((st) => filtered.some((s) => s.stage === st));

  return (
    <main className="page">
      <PageHeader
        title="Skills"
        lede="Atomic capabilities the agents use, grouped by SDLC stage. Pre-installed skills ship with the project; install your own locally and they join their stage in every feature's plan."
        actions={
          <button className="btn btnPrimary" onClick={() => setInstalling(true)} disabled={!skills}>
            {Icon.bolt}
            Install skill
          </button>
        }
      />

      {error && <ServerNotice />}
      {notice && (
        <div className={s2.toast} role="status">
          {Icon.check}
          {notice}
        </div>
      )}

      {skills && (
        <div className="toolbar">
          <div className={s2.segmented} role="group" aria-label="source">
            {(
              [
                ["all", "All"],
                ["builtin", "Pre-installed"],
                ["local", "Local"],
              ] as [Filter, string][]
            ).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>
                {label} <span className={s2.count}>{counts[v]}</span>
              </button>
            ))}
          </div>
          <label className="searchField">
            {Icon.search}
            <input className="input" placeholder="Search skills by name or what they do" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="search skills" />
          </label>
        </div>
      )}

      {!skills && !error && <Skeleton rows={3} height={90} />}

      {skills && filter === "local" && counts.local === 0 && (
        <div className="card">
          <div className={s2.emptyLocal}>
            <Empty icon={Icon.bolt}>No local skills yet. Install one to teach the agents something new.</Empty>
            <button className="btn btnPrimary" onClick={() => setInstalling(true)}>Install skill</button>
            {localDir && <span className={s2.where}>They are stored in <code>{localDir}</code></span>}
          </div>
        </div>
      )}
      {skills && filtered.length === 0 && !(filter === "local" && counts.local === 0) && (
        <div className="card">
          <Empty icon={Icon.search}>No skill matches.</Empty>
        </div>
      )}

      {stages.map((stage) => {
        const items = filtered.filter((s) => s.stage === stage);
        return (
          <section key={stage} className="section">
            <div className="sectionHead">
              <h2 className={styles.stageTitle}>{stage}</h2>
              <span className="count">{items.length} {items.length === 1 ? "skill" : "skills"}</span>
            </div>
            <div className={styles.grid}>
              {items.map((s) => (
                <div
                  key={s.name}
                  className={`card ${styles.skill} ${s.source === "local" ? s2.local : ""} ${s.audit?.verdict === "fail" ? s2.blocked : ""}`}
                >
                  <div className={styles.skillHead}>
                    <span className={styles.skillIcon}>{Icon.bolt}</span>
                    <span className={styles.skillName}>{s.name}</span>
                    {s.source === "builtin" ? (
                      <span className={`badge ${s2.pre}`} title="Ships with the project">Pre-installed</span>
                    ) : (
                      <span className={`badge ${s2.mine}`} title="Installed on this machine">Local</span>
                    )}
                  </div>
                  <p className={styles.skillSummary}>{s.summary}</p>
                  <div className={s2.foot}>
                    <AuditBadge audit={s.audit} />
                    {s.audit && (
                      <button className={s2.link} onClick={() => toggleAudit(s.name)} aria-expanded={auditOpen === s.name}>
                        {auditOpen === s.name ? "Hide audit" : "View audit"}
                      </button>
                    )}
                  </div>
                  {s.audit?.verdict === "fail" && (
                    <span className={s2.planned}>Left out of every plan until it passes the audit.</span>
                  )}
                  {auditOpen === s.name && (audits[s.name] ? <AuditFindings audit={audits[s.name]!} /> : <span className={s2.planned}>Auditing...</span>)}
                  <div className={s2.foot}>
                    {s.hasDoc ? (
                      <button className={s2.link} onClick={() => toggleDoc(s.name)} aria-expanded={open === s.name}>
                        {open === s.name ? "Hide instructions" : "View instructions"}
                      </button>
                    ) : (
                      <span className={s2.planned}>Planned, instructions not written yet</span>
                    )}
                    {s.source === "local" && (
                      <button className={`${s2.link} ${s2.remove}`} onClick={() => remove(s.name)}>
                        Remove
                      </button>
                    )}
                  </div>
                  {open === s.name && (
                    <pre className={s2.doc}>{s.name in docs ? docs[s.name] ?? "No SKILL.md yet." : "Loading..."}</pre>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {installing && (
        <InstallSkill
          policy={policy}
          propose={propose}
          onClose={() => setInstalling(false)}
          onInstalled={(name) => {
            setInstalling(false);
            flash(`Installed ${name}. Agents use it from the next plan.`);
            setFilter("all");
            load();
          }}
        />
      )}
    </main>
  );
}
