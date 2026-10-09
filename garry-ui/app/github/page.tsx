"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./prs.module.css";
import { apiBase } from "../lib/api";

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

function checkDot(checks: string): string {
  if (checks === "passing") return "ok";
  if (checks === "failing") return "run";
  return "wait";
}

export default function Prs() {
  const router = useRouter();
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

  if (error) return <main className={styles.main}><p className={styles.muted}>Cannot reach garry-server. Run pnpm serve.</p></main>;

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/github.svg" alt="" width={22} height={22} />
        Pull requests
      </h1>

      <div className={styles.toolbar}>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="feature">
          {features.map((f) => (
            <option key={f.id} value={f.id}>{f.id} {f.title}</option>
          ))}
        </select>
        <input
          className={styles.search}
          placeholder="search service, repo or branch"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
        />
        <select value={stateFilter} onChange={(e) => { setStateFilter(e.target.value); setPage(0); }} aria-label="state">
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className={styles.count}>{filtered.length} PRs</span>
      </div>

      <table className={`card ${styles.table}`}>
        <thead>
          <tr>
            <th></th>
            <th>service</th>
            <th>branch</th>
            <th>state</th>
            <th>checks</th>
            <th>repo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((pr) => (
            <tr
              key={pr.service}
              className={styles.rowLink}
              onClick={() => router.push(`/pr/${selected}/${pr.service}`)}
            >
              <td>
                {pr.url ? (
                  <a href={pr.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="open on GitHub">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/github.svg" alt="GitHub" width={16} height={16} />
                  </a>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/github.svg" alt="" width={16} height={16} />
                )}
              </td>
              <td className={styles.svc}>{pr.service}</td>
              <td className={styles.branch}>{pr.branch}</td>
              <td><span className={`${styles.badge} ${styles.draft}`}>{pr.state}</span></td>
              <td><span className={`dot ${checkDot(pr.checks)}`} />{pr.checks}</td>
              <td className={styles.repo}>{pr.repo}</td>
              <td><span className={styles.open}>details</span></td>
            </tr>
          ))}
          {pageRows.length === 0 && (
            <tr><td colSpan={7} className={styles.muted}>no pull requests match</td></tr>
          )}
        </tbody>
      </table>

      {pageCount > 1 && (
        <div className={styles.pager}>
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>prev</button>
          <span>page {page + 1} of {pageCount}</span>
          <button disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>next</button>
        </div>
      )}

      <p className={styles.note}>
        One pull request per service on branch <code>feat/{selected}</code>. Live GitHub status is wired
        in phase 6 with the narrow token. Search, filter and paging keep the view usable at hundreds of PRs.
      </p>
    </main>
  );
}
