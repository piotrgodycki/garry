import { useEffect, useMemo, useState } from "react";
import styles from "./prs.module.css";
import { apiBase } from "../lib/api";
import { Icon } from "../icons";
import { Empty, PageHeader, ServerNotice } from "../ui";
import Select from "../Select";

interface Feature {
  id: string;
  title: string;
}
interface Pr {
  service: string;
  branch: string;
  repo: string;
  url: string;
  state: string;
  checks: string;
  live: boolean;
}

const PAGE = 25;

// Checks: green passes, red fails, amber is still running. Never reuse the brand color for failure.
function checkTone(checks: string): string {
  if (checks === "passing") return "ok";
  if (checks === "failing") return "danger";
  if (checks === "pending" || checks === "running") return "warn";
  return "";
}
function stateTone(state: string): string {
  if (state === "merged") return "ok";
  if (state === "open") return "run";
  if (state === "closed") return "danger";
  return "";
}

export default function Prs() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [prs, setPrs] = useState<Pr[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch(`${apiBase}/api/features`)
      .then((r) => r.json())
      .then((d) => {
        const fs = (d.features as Feature[]) ?? [];
        setFeatures(fs);
        if (fs[0]) setSelected(fs[0].id);
        else setPrs([]);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setPage(0);
    fetch(`${apiBase}/api/features/${selected}/prs`)
      .then((r) => r.json())
      .then((d) => setPrs(d.prs as Pr[]))
      .catch((e: unknown) => setError(String(e)));
  }, [selected]);

  const states = useMemo(() => ["all", ...new Set((prs ?? []).map((p) => p.state))], [prs]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (prs ?? []).filter(
      (p) =>
        (stateFilter === "all" || p.state === stateFilter) &&
        (!q || p.service.toLowerCase().includes(q) || p.repo.toLowerCase().includes(q) || p.branch.toLowerCase().includes(q)),
    );
  }, [prs, query, stateFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <main className="page">
      <PageHeader
        eyebrow="Deliver"
        title="Pull requests"
        lede={<>One pull request per service on branch <code>feat/{selected || "FEATURE"}</code>. Search, filter and paging keep the view usable at hundreds of PRs.</>}
      />

      {error && <ServerNotice />}

      <div className="toolbar">
        {features.length > 0 && (
          <Select ariaLabel="feature" value={selected} onChange={setSelected} options={features.map((f) => ({ value: f.id, label: `${f.id} ${f.title}` }))} />
        )}
        <label className="searchField">
          {Icon.search}
          <input
            className="input"
            placeholder="Search service, repo or branch"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            aria-label="search pull requests"
          />
        </label>
        <div className={styles.segmented} role="group" aria-label="state">
          {states.map((s) => (
            <button key={s} type="button" aria-pressed={stateFilter === s} onClick={() => { setStateFilter(s); setPage(0); }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="card tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Branch</th>
              <th>State</th>
              <th>Checks</th>
              <th>Repository</th>
              <th aria-label="open"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((pr) => (
              <tr
                key={pr.service}
                className={pr.url ? styles.rowLink : ""}
                onClick={() => pr.url && window.open(pr.url, "_blank", "noopener")}
                title={pr.url ? "open on GitHub" : undefined}
              >
                <td>
                  <span className={styles.svc}>
                    <span className={styles.gh}>{Icon.github}</span>
                    {pr.service}
                  </span>
                </td>
                <td><span className="chip mono">{pr.branch}</span></td>
                <td><span className={`badge ${stateTone(pr.state)}`}>{pr.state}</span></td>
                <td>
                  <span className={`badge ${checkTone(pr.checks)}`}>
                    <span className={`dot ${checkTone(pr.checks) || "wait"}`} />
                    {pr.checks}
                  </span>
                </td>
                <td className={styles.repo}>{pr.repo}</td>
                <td className={styles.open}>
                  {pr.url ? (
                    <a href={pr.url} target="_blank" rel="noopener noreferrer" className="btn btnGhost iconBtn" aria-label={`open ${pr.service} on GitHub`} onClick={(e) => e.stopPropagation()}>
                      {Icon.external}
                    </a>
                  ) : (
                    <span className="muted" title="not opened yet">n/a</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {prs && pageRows.length === 0 && <Empty icon={Icon.prs}>{features.length ? "No pull requests match." : "No features yet, so no pull requests."}</Empty>}
        {!prs && !error && <Empty icon={Icon.prs}>Loading pull requests...</Empty>}
      </div>

      <div className={styles.foot}>
        <span className="muted">{filtered.length} {filtered.length === 1 ? "pull request" : "pull requests"}</span>
        {pageCount > 1 && (
          <div className={styles.pager}>
            <button className="btn btnSm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="muted">Page {page + 1} of {pageCount}</span>
            <button className="btn btnSm" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>

      <div className="hint">
        {Icon.alert}
        Live GitHub status is wired in phase 6 with the narrow token.
      </div>
    </main>
  );
}
