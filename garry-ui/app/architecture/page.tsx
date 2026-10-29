import { useCallback, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ArchTemplate, Architecture, ArchitectureState } from "garry-client";
import { client } from "../lib/client";
import { ServerNotice, Skeleton } from "../ui";
import styles from "./architecture.module.css";
import { useSearchParams } from "react-router";
import Select from "../Select";
import Wizard from "./Wizard";
import Board from "./Board";

/** Your services and the platforms they run on, joined like puzzle pieces: a board for the whole project and one per repository. */
export default function ArchitecturePage() {
  const [params, setParams] = useSearchParams();
  const boardId = params.get("board") ?? "";
  const [state, setState] = useState<ArchitectureState | null>(null);
  const [offline, setOffline] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  // a new board (the wizard, a template, a reset) remounts the canvas so it fits the view again
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => client.architecture(boardId).then(setState, () => setOffline(true)), [boardId]);
  useEffect(() => {
    setState(null);
    setWizardOpen(false);
    setShowTemplates(false);
    void load();
  }, [load]);

  const boardName = state?.boards.find((b) => b.id === boardId)?.name ?? (boardId || "Whole project");
  const replaced = async (a: Architecture) => {
    await client.saveArchitecture(a, boardId);
    await load();
    setVersion((v) => v + 1);
    setWizardOpen(false);
    setShowTemplates(false);
  };
  const applyTemplate = async (t: ArchTemplate) => {
    // the board's latest state is on the server (it saves as you go)
    const current = await client.architecture(boardId);
    if (current.architecture.nodes.length && !window.confirm(`Replace the ${boardName} board with ${t.name}? What is on it now is replaced.`)) return;
    setError(null);
    try {
      await replaced({ ...t.architecture, wizard: null });
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };
  const reset = async () => {
    const current = await client.architecture(boardId);
    const n = current.architecture.nodes.length;
    if (!window.confirm(`Reset the ${boardName} board? Its ${n} block${n === 1 ? "" : "s"}, their links and the wizard's answers are removed. Other boards stay as they are.`)) return;
    setError(null);
    try {
      await client.resetArchitecture(boardId);
      await load();
      setVersion((v) => v + 1);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  const empty = state ? state.architecture.nodes.length === 0 : false;
  // an empty board starts with the wizard; the ready-made ones are the other way in
  const showWizard = state ? wizardOpen || (empty && !showTemplates) : false;
  const bar = state && (
    <>
      <Select
        ariaLabel="board"
        value={boardId}
        onChange={(id) => setParams(id ? { board: id } : {})}
        options={state.boards.map((b) => ({ value: b.id, label: b.name, hint: b.blocks ? `${b.blocks} blocks` : "empty", group: b.id ? "Repositories" : undefined }))}
      />
      <button className="btn btnSm" aria-pressed={showWizard} onClick={() => (setShowTemplates(false), setWizardOpen(!showWizard || empty ? true : false))}>
        {state.architecture.wizard ? "Change the answers" : "Wizard"}
      </button>
      {state.templates.length > 0 && (
        <button className="btn btnSm" aria-pressed={showTemplates} onClick={() => (setWizardOpen(false), setShowTemplates(!showTemplates))}>
          Ready-made
        </button>
      )}
      {!empty && (
        <button className="btn btnSm btnGhost" onClick={() => void reset()}>
          Reset
        </button>
      )}
      {error && <span className="badge danger">{error}</span>}
    </>
  );
  const overlay = !state ? null : showTemplates ? (
    <section className={styles.templates} aria-label="ready-made architectures">
      <div className={styles.templatesHead}>
        <h2 className={styles.overlayTitle}>Start from a ready-made architecture</h2>
        <button className="btn btnSm btnGhost" onClick={() => setShowTemplates(false)}>
          Close
        </button>
      </div>
      <div className={styles.templateGrid}>
        {state.templates.map((t) => (
          <div key={t.id} className={`card ${styles.template}`}>
            <span className={styles.templateName}>{t.name}</span>
            <span className={styles.templateSummary}>{t.summary}</span>
            <span className={styles.templateFor}>Good for: {t.goodFor}</span>
            <button className="btn btnSm" onClick={() => void applyTemplate(t)}>
              Use this
            </button>
          </div>
        ))}
      </div>
    </section>
  ) : showWizard ? (
    <Wizard key={`${boardId}:${version}`} state={state} boardName={boardName} onBuilt={replaced} onClose={empty ? undefined : () => setWizardOpen(false)} />
  ) : null;
  return (
    <main className={styles.studio}>
      {/* the board is the page: its name is for screen readers and the top bar */}
      <h1 className={styles.hidden}>Architecture</h1>
      {offline && <ServerNotice />}
      {!state && !offline && <Skeleton rows={2} height={200} />}
      {state && (
        <ReactFlowProvider key={`${boardId}:${version}`}>
          <Board state={state} boardId={boardId} bar={bar} overlay={overlay} />
        </ReactFlowProvider>
      )}
    </main>
  );
}
