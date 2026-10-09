"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./pr.module.css";
import { apiBase } from "../../../lib/api";

interface Pr {
  service: string;
  branch: string;
  repo: string;
  url: string;
  state: string;
  checks: string;
  live: boolean;
}

export default function PrDetail({ params }: { params: Promise<{ feature: string; service: string }> }) {
  const { feature, service } = use(params);
  const [pr, setPr] = useState<Pr | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/features/${feature}/prs`)
      .then((r) => r.json())
      .then((d) => {
        const found = (d.prs as Pr[]).find((p) => p.service === service);
        if (found) setPr(found);
        else setMissing(true);
      })
      .catch(() => setMissing(true));
  }, [feature, service]);

  if (missing) return <main className={styles.main}><p><Link href="/github">back</Link></p><p className={styles.muted}>No pull request for {service}.</p></main>;
  if (!pr) return <main className={styles.main}><p className={styles.muted}>Loading...</p></main>;

  return (
    <main className={styles.main}>
      <p><Link href="/github">back to pull requests</Link></p>
      <div className={styles.head}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/github.svg" alt="" width={28} height={28} />
        <h1>{feature}: {pr.service}</h1>
        <span className={`${styles.badge}`}>{pr.state}</span>
      </div>

      <div className={`card ${styles.block}`}>
        <dl className={styles.dl}>
          <dt>service</dt><dd><Link href={`/service/${pr.service}`}>{pr.service}</Link></dd>
          <dt>branch</dt><dd className={styles.mono}>{pr.branch}</dd>
          <dt>repo</dt><dd className={styles.mono}>{pr.repo}</dd>
          <dt>checks</dt><dd><span className={`dot ${pr.checks === "passing" ? "ok" : pr.checks === "failing" ? "run" : "wait"}`} />{pr.checks}</dd>
          <dt>source</dt><dd>{pr.live ? "live GitHub" : "derived (phase 6 wires live data)"}</dd>
        </dl>
        {pr.url && (
          <a className={styles.gh} href={pr.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/github.svg" alt="" width={16} height={16} />
            open on GitHub
          </a>
        )}
      </div>
    </main>
  );
}
