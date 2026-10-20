"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../panel.module.css";
import { apiBase } from "../lib/api";
import { Icon } from "../icons";
import { PageHeader, ServerNotice, Skeleton } from "../ui";
import ContractEvent from "../ContractEvent";
import { flattenTokens, type RegistryData } from "../lib/contracts";

export default function Registry() {
  const [data, setData] = useState<RegistryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/registry`)
      .then((r) => r.json())
      .then((d: RegistryData) => setData(d))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const contracts = data
    ? [
        { label: "Remotes", value: Object.keys(data.contracts.remotes ?? {}).length },
        { label: "Shared dependencies", value: Object.keys(data.contracts.sharedDeps ?? {}).length },
        { label: "Events", value: Object.keys(data.contracts.events ?? {}).length },
      ]
    : [];

  return (
    <main className="page">
      <PageHeader
        eyebrow="Configure"
        title="Contract registry"
        lede="Every service, what it exposes and what it consumes. Agents read this before they touch a repository, so no change can break a contract."
      />

      {error && <ServerNotice />}
      {!data && !error && <Skeleton rows={2} height={140} />}

      {data && (
        <>
          <div className="stats">
            <div className="card stat">
              <span className="statLabel">Services</span>
              <span className="statValue">{data.services.length}</span>
            </div>
            {contracts.map((c) => (
              <div key={c.label} className="card stat">
                <span className="statLabel">{c.label}</span>
                <span className="statValue">{c.value}</span>
              </div>
            ))}
          </div>

          <section className="section">
            <div className="sectionHead">
              <h2>Services</h2>
              <span className="count">{data.services.length} registered</span>
            </div>
            <div className={styles.grid}>
              {data.services.map((s) => {
                const deps = Object.keys(s.consumes);
                return (
                  <Link key={s.name} href={`/service/${s.name}`} className={`card cardLink ${styles.svcCard}`}>
                    <div className={styles.svcHead}>
                      <span className={styles.svcIcon}>{Icon.service}</span>
                      <div className={styles.svcTitle}>
                        <span className={styles.svcName}>{s.name}</span>
                        {s.owner && <span className={styles.svcMeta}>{s.owner}</span>}
                      </div>
                      <span className={styles.chevron}>{Icon.chevron}</span>
                    </div>
                    {s.stack && <div className={styles.stack}>{s.stack}</div>}
                    <dl className={styles.facts}>
                      <dt>Exposes</dt>
                      <dd>
                        {s.exposes.length ? s.exposes.map((e) => <span key={e} className="chip mono">{e}</span>) : <span className="muted">nothing</span>}
                      </dd>
                      <dt>Consumes</dt>
                      <dd>
                        {deps.length ? deps.map((d) => <span key={d} className="chip">{d}</span>) : <span className="muted">nothing</span>}
                      </dd>
                    </dl>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="section" id="contracts">
            <div className="sectionHead">
              <h2>Contracts</h2>
              <span className="count">the agreements between services</span>
            </div>
            <p className={styles.explain}>
              A contract is what one service promises the others: the events it sends and their exact data, the
              modules it exposes, the libraries everyone shares. Services code against the contract, never against
              each other&apos;s internals. Garry changes a contract first, validates it, and only then lets the
              agents touch code.
            </p>

            <h3 className={styles.subhead}>Events <code>events.json</code></h3>
            <div className={styles.eventList}>
              {Object.entries(data.contracts.events ?? {}).map(([name, e]) => (
                <div key={name} className="card">
                  <ContractEvent name={name} event={e} />
                </div>
              ))}
              {Object.keys(data.contracts.events ?? {}).length === 0 && <p className="muted">No events.</p>}
            </div>

            <h3 className={styles.subhead}>Remote modules <code>remotes.json</code></h3>
            <div className="card tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Exposes</th>
                    <th>Used by</th>
                    <th>Entry</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.contracts.remotes ?? {}).map(([svc, r]) => {
                    const usedBy = data.services.filter((x) => x.consumes[svc]?.length);
                    return (
                      <tr key={svc}>
                        <td className="strong"><Link href={`/service/${svc}`}>{svc}</Link></td>
                        <td><span className={styles.chips}>{(r.exposes ?? []).map((m) => <span key={m} className="chip mono">{m}</span>)}</span></td>
                        <td>
                          {usedBy.length ? (
                            <span className={styles.usedBy}>
                              {usedBy.map((x) => (
                                <span key={x.name}>
                                  <b>{x.name}</b> <span className="muted">{x.consumes[svc].join(", ")}</span>
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="muted">nobody yet</span>
                          )}
                        </td>
                        <td className={styles.entry}>{r.entry}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.twoCol}>
              <div>
                <h3 className={styles.subhead}>Shared dependencies <code>shared-deps.json</code></h3>
                <div className="card tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Library</th>
                        <th>Version</th>
                        <th>One copy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.contracts.sharedDeps ?? {}).map(([lib, d]) => (
                        <tr key={lib}>
                          <td className="strong mono">{lib}</td>
                          <td className="mono">{d.requiredVersion ?? d.version}</td>
                          <td>{d.singleton ? <span className="badge ok">singleton</span> : <span className="muted">no</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className={styles.subhead}>Design tokens <code>design-tokens.json</code></h3>
                <div className="card">
                  <ul className={styles.tokens}>
                    {flattenTokens(data.contracts.designTokens).map(([k, v]) => (
                      <li key={k}>
                        {/^#[0-9a-f]{3,8}$/i.test(v) && <span className={styles.swatch} style={{ background: v }} />}
                        <span className="mono">{k}</span>
                        <span className={`muted ${styles.tokenValue}`}>{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
