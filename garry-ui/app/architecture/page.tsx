import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ArchBlock, ArchIssue, ArchSuggestion, ArchTemplate, Architecture, ArchitectureState } from "garry-client";
import { client } from "../lib/client";
import { PageHeader, ServerNotice, Skeleton } from "../ui";
import styles from "./architecture.module.css";

// the block's header, then one row per port
const HEAD = 52;
const ROW = 22;

type BlockData = { block: ArchBlock; label?: string; caps: Record<string, string>; level?: "error" | "warn" };
type BlockNode = Node<BlockData, "block">;

/** A puzzle piece: what it provides sockets in on the left, what it needs plugs out on the right. */
function BlockCard({ data, selected }: NodeProps<BlockNode>) {
  const { block, caps } = data;
  const needs = block.needs ?? [];
  const rows = Math.max(block.provides.length, needs.length, 1);
  return (
    <div className={`${styles.block} ${selected ? styles.blockSelected : ""} ${data.level ? styles[data.level] : ""}`} style={{ height: HEAD + rows * ROW + 8 }}>
      <div className={styles.blockHead}>
        <span className={styles.blockName}>{data.label || block.name}</span>
        <span className={styles.blockProvider}>{block.provider}</span>
      </div>
      {block.provides.map((c, i) => (
        <Handle key={`p-${c}`} id={c} type="target" position={Position.Left} className={`${styles.port} ${styles.provide}`} style={{ top: HEAD + i * ROW + ROW / 2 }}>
          <span className={styles.portLabel}>{caps[c] ?? c}</span>
        </Handle>
      ))}
      {needs.map((c, i) => (
        <Handle key={`n-${c}`} id={c} type="source" position={Position.Right} className={`${styles.port} ${styles.need}`} style={{ top: HEAD + i * ROW + ROW / 2 }}>
          <span className={styles.portLabel}>{caps[c] ?? c}</span>
        </Handle>
      ))}
    </div>
  );
}
const nodeTypes = { block: BlockCard };

const toFlow = (a: Architecture, blocks: Map<string, ArchBlock>, caps: Record<string, string>): { nodes: BlockNode[]; edges: Edge[] } => ({
  nodes: a.nodes.filter((n) => blocks.has(n.block)).map((n) => ({ id: n.id, type: "block", position: { x: n.x, y: n.y }, data: { block: blocks.get(n.block)!, label: n.label, caps } })),
  edges: a.edges.map((e) => ({ id: `${e.from}>${e.to}:${e.capability}`, source: e.from, target: e.to, sourceHandle: e.capability, targetHandle: e.capability, label: caps[e.capability] ?? e.capability })),
});
const fromFlow = (nodes: BlockNode[], edges: Edge[]): Architecture => ({
  nodes: nodes.map((n) => ({ id: n.id, block: n.data.block.id, label: n.data.label, x: n.position.x, y: n.position.y })),
  edges: edges.map((e) => ({ from: e.source, to: e.target, capability: String(e.sourceHandle) })),
});

function Board({ state }: { state: ArchitectureState }) {
  const blocks = useMemo(() => new Map([...state.services, ...state.components].map((b) => [b.id, b])), [state]);
  const initial = useMemo(() => toFlow(state.architecture, blocks, state.capabilities), [state, blocks]);
  const [nodes, setNodes, onNodesChange] = useNodesState<BlockNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [issues, setIssues] = useState<ArchIssue[]>(state.issues);
  const [saved, setSaved] = useState<"saved" | "saving" | "error" | null>(null);
  const [query, setQuery] = useState("");
  const flow = useReactFlow();
  // fit the board once its blocks are measured (fitView on mount runs before that)
  const measured = useNodesInitialized();
  const fitted = useRef(false);
  useEffect(() => {
    if (!measured || fitted.current) return;
    fitted.current = true;
    void flow.fitView({ maxZoom: 1, padding: 0.2 });
  }, [measured, flow]);
  const wrap = useRef<HTMLDivElement>(null);

  // save a moment after the last change; the answer carries what the check says
  const board = JSON.stringify(fromFlow(nodes, edges));
  const last = useRef(JSON.stringify(state.architecture));
  useEffect(() => {
    // measuring, selecting and marking blocks change nothing on disk
    if (board === last.current) return;
    last.current = board;
    setSaved("saving");
    const t = setTimeout(() => {
      client.saveArchitecture(JSON.parse(board) as Architecture).then(
        (r) => {
          setIssues(r.issues);
          setSaved("saved");
        },
        () => setSaved("error"),
      );
    }, 700);
    return () => clearTimeout(t);
    // positions change on every drag frame; the timer debounces it
  }, [board]);

  // mark blocks that something is wrong with
  useEffect(() => {
    const level = new Map<string, "error" | "warn">();
    for (const i of issues) if (i.node && i.level !== "info") level.set(i.node, i.level === "error" || level.get(i.node) === "error" ? "error" : "warn");
    issues.forEach((i) => {
      if (i.edge === undefined || i.level !== "error") return;
      const e = edges[i.edge];
      if (e) level.set(e.source, "error");
    });
    // only a real change replaces the nodes, or every save would trigger the next one
    setNodes((ns) => (ns.some((n) => n.data.level !== level.get(n.id)) ? ns.map((n) => (n.data.level === level.get(n.id) ? n : { ...n, data: { ...n.data, level: level.get(n.id) } })) : ns));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues]);

  // only fitting pieces join: a need plugs into the same capability, never into itself
  const isValidConnection = useCallback((c: Connection | Edge) => c.source !== c.target && !!c.sourceHandle && c.sourceHandle === c.targetHandle, []);
  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((es) => addEdge({ ...c, id: `${c.source}>${c.target}:${c.sourceHandle}`, label: state.capabilities[c.sourceHandle ?? ""] ?? c.sourceHandle }, es)),
    [setEdges, state.capabilities],
  );

  const add = (b: ArchBlock, at?: { x: number; y: number }) => {
    const pos = at ?? flow.screenToFlowPosition({ x: (wrap.current?.getBoundingClientRect().left ?? 0) + 260, y: (wrap.current?.getBoundingClientRect().top ?? 0) + 120 });
    const id = `${b.id.replace(/[^A-Za-z0-9_-]/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;
    setNodes((ns) => [...ns, { id, type: "block", position: pos, data: { block: b, caps: state.capabilities } }]);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const b = blocks.get(e.dataTransfer.getData("application/garry-block"));
    if (b) add(b, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  const q = query.trim().toLowerCase();
  const groups = [
    { label: "Your services", items: state.services },
    ...state.providers.map((p) => ({ label: p, items: state.components.filter((c) => c.provider === p) })),
  ]
    .map((g) => ({ ...g, items: g.items.filter((b) => !q || b.name.toLowerCase().includes(q) || b.provides.some((c) => c.includes(q))) }))
    .filter((g) => g.items.length);
  // suggestions: quick fixes follow the board; Garry's own come on request
  const [fixes, setFixes] = useState<ArchSuggestion[]>([]);
  const [goal, setGoal] = useState("");
  const [asking, setAsking] = useState(false);
  const [garry, setGarry] = useState<{ summary?: string; suggestions: ArchSuggestion[]; error?: string } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => void client.suggestArchitecture(JSON.parse(board) as Architecture).then((r) => setFixes(r.quickFixes), () => undefined), 400);
    return () => clearTimeout(t);
  }, [board]);
  const ask = async () => {
    setAsking(true);
    setGarry(null);
    try {
      const r = await client.suggestArchitecture(JSON.parse(board) as Architecture, goal, true);
      setGarry({ summary: r.summary, suggestions: r.suggestions ?? [], error: r.error });
    } catch (e) {
      setGarry({ suggestions: [], error: String((e as Error).message ?? e) });
    } finally {
      setAsking(false);
    }
  };
  // add a suggestion's blocks next to the block it is about, then its links
  const apply = (sg: ArchSuggestion) => {
    const anchor = nodes.find((x) => sg.links.some((l) => l.from === x.id || l.to === x.id));
    const base = anchor ? { x: anchor.position.x + 360, y: anchor.position.y } : flow.screenToFlowPosition({ x: 400, y: 300 });
    const made = sg.add.map((a, i) => ({ id: `${a.block.replace(/[^A-Za-z0-9_-]/g, "-")}-${Math.random().toString(36).slice(2, 6)}`, block: blocks.get(a.block), label: a.label, i }));
    const ref = (id: string) => (id.startsWith("new:") ? made[Number(id.slice(4))]?.id : id);
    setNodes((ns) => [...ns, ...made.filter((m) => m.block).map((m) => ({ id: m.id, type: "block" as const, position: { x: base.x, y: base.y + m.i * 160 }, data: { block: m.block!, label: m.label, caps: state.capabilities } }))]);
    setEdges((es) =>
      sg.links.reduce((acc, l) => {
        const from = ref(l.from);
        const to = ref(l.to);
        return from && to ? addEdge({ id: `${from}>${to}:${l.capability}`, source: from, target: to, sourceHandle: l.capability, targetHandle: l.capability, label: state.capabilities[l.capability] ?? l.capability }, acc) : acc;
      }, es),
    );
  };
  const card = (sg: ArchSuggestion, k: number) => (
    <div key={`${sg.title}${k}`} className={styles.suggestion}>
      <span className={styles.suggestionTitle}>{sg.title}</span>
      {sg.why && <span className={styles.suggestionWhy}>{sg.why}</span>}
      <button className="btn btnSm" onClick={() => apply(sg)}>
        Add to the board
      </button>
    </div>
  );

  const shown = issues.filter((i) => i.level !== "info");
  const notes = issues.filter((i) => i.level === "info");

  return (
    <div className={styles.layout}>
      <aside className={`card ${styles.palette}`}>
        <input className="input" placeholder="Search blocks or what they provide" value={query} onChange={(e) => setQuery(e.target.value)} />
        {groups.map((g) => (
          <div key={g.label} className={styles.group}>
            <span className={styles.groupLabel}>{g.label}</span>
            {g.items.map((b) => (
              <button
                key={b.id}
                className={styles.paletteItem}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("application/garry-block", b.id)}
                onClick={() => add(b)}
                title={b.note ?? `provides ${b.provides.join(", ") || "nothing"}${b.needs?.length ? `; needs ${b.needs.join(", ")}` : ""}`}
              >
                {b.name}
              </button>
            ))}
          </div>
        ))}
        {state.services.length === 0 && <p className={styles.hint}>Your services appear here once they are in the registry.</p>}
      </aside>

      <div className={`card ${styles.canvas}`} ref={wrap} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
          defaultViewport={{ x: 40, y: 40, zoom: 1 }}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
        {nodes.length === 0 && <p className={styles.empty}>Drag blocks here from the left, then join a need (right side) to a block that provides it (left side).</p>}
        <span className={styles.saved}>{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved to architecture.json" : saved === "error" ? "Not saved" : ""}</span>
      </div>

      <aside className={`card ${styles.issues}`}>
        <span className="eyebrow">What Garry sees</span>
        {shown.length === 0 && notes.length === 0 && <p className={styles.hint}>{nodes.length ? "Everything fits." : "Nothing on the board yet."}</p>}
        {shown.map((i, k) => (
          <p key={`${i.message}${k}`} className={styles.issue}>
            <span className={`badge ${i.level === "error" ? "danger" : "warn"}`}>{i.level === "error" ? "does not fit" : "missing"}</span> {i.message}
          </p>
        ))}
        {notes.map((i, k) => (
          <p key={`${i.message}${k}`} className={`${styles.issue} muted`}>
            {i.message}
          </p>
        ))}

        {fixes.length > 0 && (
          <>
            <span className="eyebrow">Quick fixes</span>
            {fixes.slice(0, 6).map(card)}
          </>
        )}

        <span className="eyebrow">Ask Garry</span>
        <textarea
          className={`input ${styles.goal}`}
          placeholder="What is it for? e.g. a shop for 10k users a day, on Cloudflare, cheap to run"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
        <button className="btn btnPrimary btnSm" disabled={asking} onClick={() => void ask()}>
          {asking ? "Garry is thinking…" : "Suggest"}
        </button>
        {garry?.error && <p className={styles.issue}><span className="badge danger">could not ask</span> {garry.error}</p>}
        {garry?.summary && <p className={styles.issue}>{garry.summary}</p>}
        {garry?.suggestions.map(card)}
        {garry && !garry.error && garry.suggestions.length === 0 && <p className={styles.hint}>Nothing to add: Garry is happy with it.</p>}
      </aside>
    </div>
  );
}

/** Your services and the platforms they run on, joined like puzzle pieces. */
export default function ArchitecturePage() {
  const [state, setState] = useState<ArchitectureState | null>(null);
  const [offline, setOffline] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  // a new board (a template) remounts the canvas so it fits the view again
  const [version, setVersion] = useState(0);
  const [templateError, setTemplateError] = useState<string | null>(null);
  useEffect(() => {
    client.architecture().then(setState, () => setOffline(true));
  }, []);

  const applyTemplate = async (t: ArchTemplate) => {
    // the board's latest state is on the server (it saves as you go)
    const current = await client.architecture();
    if (current.architecture.nodes.length && !window.confirm(`Replace the board with ${t.name}? What is on it now is replaced.`)) return;
    setTemplateError(null);
    try {
      await client.saveArchitecture(t.architecture);
      setState(await client.architecture());
      setVersion((v) => v + 1);
      setShowTemplates(false);
    } catch (e) {
      setTemplateError(String((e as Error).message ?? e));
    }
  };
  const templatesOpen = state ? showTemplates || (state.architecture.nodes.length === 0 && version === 0) : false;
  return (
    <main className="page">
      <PageHeader
        eyebrow="Configure"
        title="Architecture"
        lede="Your services and the platforms they run on. Every block shows what it provides (left) and what it needs (right); only fitting pieces join, and Garry says what is missing or will not work."
      />
      {offline && <ServerNotice />}
      {!state && !offline && <Skeleton rows={2} height={200} />}
      {state && state.templates.length > 0 && (
        <section className={styles.templates} aria-label="ready-made architectures">
          <div className={styles.templatesHead}>
            <span className="eyebrow">Start from a ready-made architecture</span>
            <button className="btn btnSm btnGhost" aria-expanded={templatesOpen} onClick={() => setShowTemplates(!templatesOpen)}>
              {templatesOpen ? "Hide" : "Show"}
            </button>
          </div>
          {templatesOpen && (
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
          )}
          {templateError && <span className="badge danger">{templateError}</span>}
        </section>
      )}
      {state && (
        <ReactFlowProvider key={version}>
          <Board state={state} />
        </ReactFlowProvider>
      )}
    </main>
  );
}
