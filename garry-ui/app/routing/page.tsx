import { useCallback, useEffect, useState } from "react";
import type { Model, RoutingProfile, RoutingProfiles } from "garry-client";
import styles from "../panel.module.css";
import own from "./routing.module.css";
import { tierOf } from "../ModelChip";
import { client } from "../lib/client";
import { Icon } from "../icons";
import { PageHeader, ServerNotice, Skeleton } from "../ui";

const STAGES = ["spec", "plan", "design", "implement", "review", "test", "integrate"];
const AGENTS = ["garry-analyst", "garry-dev", "garry-reviewer"];

/** Routing profiles: Garry's example and your own; which agent and model handle each stage. */
export default function Routing() {
  const [data, setData] = useState<RoutingProfiles | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (pick?: string) => {
    try {
      const [p, m] = await Promise.all([client.routingProfiles(), client.models()]);
      setData(p);
      setModels(m);
      setSelected((cur) => pick ?? (cur && p.profiles.some((x) => x.name === cur) ? cur : p.active));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const run = async (fn: () => Promise<unknown>, pick?: string) => {
    setError(null);
    try {
      await fn();
      await load(pick);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  const profile = data?.profiles.find((p) => p.name === selected) ?? null;
  const label = (id: string) => models.find((m) => m.id === id)?.label ?? id;

  const change = (stage: string, route: { model?: string; agent?: string }) =>
    run(async () => {
      await client.setProfileRoute(selected, stage, route);
      setSaved(stage);
      setTimeout(() => setSaved((s) => (s === stage ? null : s)), 2000);
    });

  const create = () =>
    run(async () => {
      await client.createRoutingProfile(newName.trim(), selected || "default");
      setNewName("");
      setCreating(false);
    }, newName.trim());

  const row = (stage: string, r: RoutingProfile["defaults"], p: RoutingProfile) => (
    <tr key={stage}>
      <td className={`strong ${styles.cap}`}>{stage === "defaults" ? "Everything else" : stage}</td>
      <td>
        {p.builtin ? (
          <span className="chip mono">{r.agent}</span>
        ) : (
          <select className={own.agentSelect} value={r.agent} onChange={(e) => void change(stage, { agent: e.target.value })} aria-label={`agent for ${stage}`}>
            {[...new Set([r.agent, ...AGENTS])].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        <label className={styles.modelCell}>
          <span className={`tier ${tierOf(r.model)}`} />
          {p.builtin ? (
            <span>{label(r.model)}</span>
          ) : (
            <select className={styles.modelSelect} value={r.model} onChange={(e) => void change(stage, { model: e.target.value })} aria-label={`model for ${stage}`}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </label>
      </td>
      <td className={styles.savedCell}>{saved === stage && <span className="badge ok">{Icon.check}Saved</span>}</td>
    </tr>
  );

  return (
    <main className="page">
      <PageHeader
        eyebrow="Configure"
        title="Model routing"
        lede="Which agent role and which model handle each SDLC stage. Default is Garry's example; make profiles of your own from it, pick the active one, and let a feature use another (routing: in its frontmatter)."
      />
      {offline && <ServerNotice />}
      {!data && !offline && <Skeleton rows={4} height={48} />}
      {error && <p className="badge danger">{error}</p>}

      {data && (
        <>
          <div className={own.profiles} role="tablist" aria-label="routing profiles">
            {data.profiles.map((p) => (
              <button
                key={p.name}
                role="tab"
                aria-selected={p.name === selected}
                className={`card ${own.profile} ${p.name === selected ? own.selected : ""}`}
                onClick={() => setSelected(p.name)}
              >
                <span className={own.profileHead}>
                  <span className={own.profileName}>{p.name}</span>
                  {p.name === data.active && <span className="badge ok">Active</span>}
                  {p.builtin && <span className="badge">Example</span>}
                </span>
                {p.description && <span className={own.profileDesc}>{p.description}</span>}
              </button>
            ))}
            {creating ? (
              <div className={`card ${own.profile} ${own.newProfile}`}>
                <input className="input mono" placeholder="fast-and-cheap" value={newName} autoFocus onChange={(e) => setNewName(e.target.value.toLowerCase())} onKeyDown={(e) => e.key === "Enter" && newName.trim() && void create()} />
                <span className={own.profileDesc}>Starts as a copy of {selected || "default"}.</span>
                <span className={own.row}>
                  <button className="btn btnSm btnPrimary" disabled={!newName.trim()} onClick={() => void create()}>
                    Create
                  </button>
                  <button className="btn btnSm btnGhost" onClick={() => setCreating(false)}>
                    Cancel
                  </button>
                </span>
              </div>
            ) : (
              <button className={`card ${own.profile} ${own.add}`} onClick={() => setCreating(true)}>
                + New profile
              </button>
            )}
          </div>

          {profile && (
            <>
              <div className={own.toolbar}>
                {profile.builtin ? (
                  <span className="muted">Garry&apos;s example stays as it is. Make a profile from it to change the models.</span>
                ) : (
                  <span className="muted">Changes are saved to routing/{profile.name}.json in the registry and apply to the next run.</span>
                )}
                <span className={own.row}>
                  {profile.name !== data.active && (
                    <button className="btn btnSm btnPrimary" onClick={() => void run(() => client.useRoutingProfile(profile.name))}>
                      Use this profile
                    </button>
                  )}
                  {!profile.builtin && (
                    <button
                      className="btn btnSm btnGhost"
                      onClick={() => window.confirm(`Remove the profile ${profile.name}?`) && void run(() => client.removeRoutingProfile(profile.name), data.active === profile.name ? "default" : data.active)}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </div>
              <div className="card tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Agent</th>
                      <th>Model</th>
                      <th aria-label="status"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAGES.map((s) => row(s, profile.stages[s] ?? profile.defaults, profile))}
                    {row("defaults", profile.defaults, profile)}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="hint">
            <span className="tier opus" /> Opus
            <span className="tier sonnet" /> Sonnet
            <span className="tier haiku" /> Haiku
            <span className="tier fable" /> Fable
          </div>
        </>
      )}
    </main>
  );
}
