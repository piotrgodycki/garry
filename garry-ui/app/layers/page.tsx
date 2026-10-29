import { useCallback, useEffect, useState } from "react";
import type { Layer, LayerScope, Layers, SkillSummary, Stack } from "garry-client";
import Link from "../lib/router";
import { client } from "../lib/client";
import { PageHeader, ServerNotice, Skeleton } from "../ui";
import LayerEditor, { EMPTY, inheritedSkills } from "./LayerEditor";
import AgentGets from "./AgentGets";
import styles from "./layers.module.css";

type Data = Awaited<ReturnType<typeof client.layers>>;

const keyOf = (s: LayerScope) => (s.level === "project" ? "project" : `${s.level}:${s.name}`);
const summary = (l: Layer | undefined) => {
  if (!l) return "Nothing of its own";
  const parts = [l.skills.length && `${l.skills.length} skill${l.skills.length > 1 ? "s" : ""}`, l.skillsOff.length && `${l.skillsOff.length} off`, l.stacks.length && `${l.stacks.length} stack${l.stacks.length > 1 ? "s" : ""}`, l.notes && "notes"].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing of its own";
};

/**
 * Layers: what agents are given, set for the whole project and changed per
 * repository and per service. Pick a layer on the left, change it in the
 * middle, and see on the right what an agent in a repository ends up with.
 */
export default function LayersPage() {
  const [data, setData] = useState<Data | null>(null);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [offline, setOffline] = useState(false);
  const [scope, setScope] = useState<LayerScope>({ level: "project" });
  const [version, setVersion] = useState(0);

  const load = useCallback(
    () =>
      Promise.all([client.layers(), client.skills(), client.stacks()])
        .then(([d, sk, st]) => {
          setData(d);
          setSkills(sk.filter((s) => s.hasDoc && s.audit?.verdict !== "fail"));
          setStacks(st.stacks);
          setOffline(false);
        })
        .catch(() => setOffline(true)),
    [],
  );
  useEffect(() => void load(), [load]);

  const layers: Layers | undefined = data?.layers;
  const at = (s: LayerScope): Layer | undefined => (!layers ? undefined : s.level === "project" ? layers.project : (s.level === "repo" ? layers.repos : layers.services)[s.name]);
  const service = scope.level === "service" ? data?.services.find((s) => s.name === scope.name) : undefined;
  // the repository whose agents a change here reaches
  const repoName = scope.level === "repo" ? scope.name : service?.inRepo ?? null;
  const save = async (layer: Layer) => {
    const r = await client.saveLayer(scope, layer);
    setData((d) => (d ? { ...d, layers: r.layers } : d));
    setVersion((v) => v + 1);
  };

  const item = (s: LayerScope, title: string, hint: string) => (
    <button key={keyOf(s)} type="button" role="radio" aria-checked={keyOf(s) === keyOf(scope)} className={styles.where} onClick={() => setScope(s)}>
      <b>{title}</b>
      <span>{hint}</span>
    </button>
  );

  return (
    <main className="page">
      <PageHeader
        title="Layers"
        lede="What agents are given: skills, stacks and the team's notes. Set them once for the whole project, then change them for a repository or a service. An agent working in a repository gets all of it added up, with the architecture boards of the project and the repository."
      />
      {offline && <ServerNotice />}
      {!data || !layers ? (
        <Skeleton rows={3} height={90} />
      ) : (
        <div className={styles.layout}>
          <nav className={`card ${styles.tree}`} aria-label="layers">
            <div role="radiogroup" aria-label="layer to change" className={styles.treeGroup}>
              <span className={styles.treeHead}>Project</span>
              {item({ level: "project" }, "Whole project", summary(layers.project))}
              <span className={styles.treeHead}>Repositories</span>
              {data.repos.length ? data.repos.map((r) => item({ level: "repo", name: r.name }, r.name, summary(layers.repos[r.name]))) : <span className={styles.none}>No repositories yet. <Link href="/build">Add one in Build</Link>.</span>}
              <span className={styles.treeHead}>Services</span>
              {data.services.length ? (
                data.services.map((s) => item({ level: "service", name: s.name }, s.name, `${s.inRepo ? `in ${s.inRepo}` : "repository not added"} · ${summary(layers.services[s.name])}`))
              ) : (
                <span className={styles.none}>No services yet. <Link href="/registry">Add one in Services</Link>.</span>
              )}
            </div>
          </nav>

          <LayerEditor
            key={keyOf(scope)}
            scope={scope}
            layer={at(scope) ?? EMPTY}
            inherited={inheritedSkills(layers, skills, scope, repoName)}
            skills={skills}
            stacks={stacks}
            projectStacks={layers.project.stacks}
            builtWith={service?.stackRef ?? null}
            serviceRepo={service ? (service.inRepo ?? service.repo) : null}
            onSave={save}
          />

          <AgentGets repos={data.repos} prefer={repoName} version={version} />
        </div>
      )}
    </main>
  );
}
