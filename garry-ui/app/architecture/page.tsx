import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import {
  addEdge,
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  MarkerType,
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
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ArchBlock, ArchIssue, ArchSuggestion, ArchTemplate, Architecture, ArchitectureState } from "garry-client";
import { client } from "../lib/client";
import { PageHeader, ServerNotice, Skeleton } from "../ui";
import styles from "./architecture.module.css";
import { isDark, logoOf } from "./logos";
import { relationOf } from "./relations";
import { useSearchParams } from "react-router";
import Select from "../Select";
import Wizard from "./Wizard";

// the block's header, then one row per port
const HEAD = 58;
const ROW = 26;

type BlockData = { block: ArchBlock; label?: string; caps: Record<string, string>; level?: "error" | "warn"; uses?: string[] };
type BlockNode = Node<BlockData, "block">;

/** One glyph per kind of block, drawn on the 24px grid like the rest of the icons. */
const GLYPH: Record<string, ReactNode> = {
  client: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  edge: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.3 3.7 5.2 3.7 8.5s-1.2 6.2-3.7 8.5c-2.5-2.3-3.7-5.2-3.7-8.5S9.5 5.8 12 3.5z" /></>,
  compute: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9h3.5M2.5 15h3.5M18 9h3.5M18 15h3.5" /></>,
  data: <><ellipse cx="12" cy="6" rx="7.5" ry="2.8" /><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" /></>,
  storage: <><path d="M3.5 7.5l8.5-4 8.5 4v9l-8.5 4-8.5-4z" /><path d="M3.5 7.5l8.5 4 8.5-4M12 11.5v9" /></>,
  messaging: <><path d="M4 5h16v10H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
  identity: <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 018 0v2.5M12 14.5v2.5" /></>,
  content: <><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 15.5h6" /></>,
  external: <><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></>,
};

/** The service's logo, its monogram, or the glyph of its kind (browsers, your own services). */
function BlockLogo({ blockId, group, small }: { blockId: string; group: string; small?: boolean }) {
  const logo = logoOf(blockId);
  const color = logo ? (isDark(logo.hex) ? "var(--color-text-default)" : logo.hex) : undefined;
  return (
    <span className={`${styles.blockIcon} ${small ? styles.blockIconSmall : ""} ${styles[`g_${group}`] ?? ""}`} aria-hidden="true" style={color ? ({ "--tone": color } as CSSProperties) : undefined}>
      {logo && "path" in logo ? (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d={logo.path} />
        </svg>
      ) : logo ? (
        <span className={styles.monogram}>{logo.text}</span>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {GLYPH[group] ?? GLYPH.compute}
        </svg>
      )}
    </span>
  );
}

/** A puzzle piece: what it provides sockets in on the left, what it needs plugs out on the right. */
function BlockCard({ data, selected }: NodeProps<BlockNode>) {
  const { block, caps } = data;
  // what it needs, plus what it is linked to beyond that (a platform using a database)
  const needs = [...(block.needs ?? []), ...(data.uses ?? []).filter((c) => !(block.needs ?? []).includes(c))];
  const rows = Math.max(block.provides.length, needs.length, 1);
  const group = block.id.startsWith("service:") ? "service" : block.group;
  return (
    <div className={`${styles.block} ${styles[`g_${group}`] ?? ""} ${selected ? styles.blockSelected : ""} ${data.level ? styles[data.level] : ""}`} style={{ height: HEAD + rows * ROW + 10 }}>
      <div className={styles.blockHead}>
        <BlockLogo blockId={block.id} group={group} />
        <span className={styles.blockTitle}>
          <span className={styles.blockName}>{data.label || block.name}</span>
          <span className={styles.blockProvider}>{data.label && data.label !== block.name ? `${block.name} · ${block.provider}` : block.provider}</span>
        </span>
        {data.level && (
          <span className={styles.blockFlag} title={data.level === "error" ? "does not fit" : "something is missing"}>
            !
          </span>
        )}
      </div>
      <div className={styles.blockPorts} style={{ gridTemplateRows: `repeat(${rows}, ${ROW}px)` }}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={styles.portRow}>
            <span className={styles.provideLabel}>{block.provides[i] ? (caps[block.provides[i]] ?? block.provides[i]) : ""}</span>
            <span className={styles.needLabel}>{needs[i] ? (caps[needs[i]] ?? needs[i]) : ""}</span>
          </div>
        ))}
      </div>
      {block.provides.map((c, i) => (
        <Handle key={`p-${c}`} id={c} type="target" position={Position.Left} className={`${styles.port} ${styles.provide}`} style={{ top: HEAD + i * ROW + ROW / 2 }} title={`provides ${caps[c] ?? c}`} />
      ))}
      {needs.map((c, i) => (
        <Handle key={`n-${c}`} id={c} type="source" position={Position.Right} className={`${styles.port} ${styles.need}`} style={{ top: HEAD + i * ROW + ROW / 2 }} title={`needs ${caps[c] ?? c}`} />
      ))}
    </div>
  );
}
const nodeTypes = { block: BlockCard };

/** The block being pointed at or selected: its relations stand out, the rest step back. */
const FocusContext = createContext<{ focus: string | null; caps: Record<string, string> }>({ focus: null, caps: {} });

/** A relation: from the block that needs to the block that provides, with what flows between them. */
function RelationEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, sourceHandleId, markerEnd, style, selected }: EdgeProps) {
  const { focus, caps } = useContext(FocusContext);
  const flow = useReactFlow();
  const cap = sourceHandleId ?? "";
  const rel = relationOf((flow.getNode(source)?.data as BlockData | undefined)?.block, cap);
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12 });
  const state = selected || (focus && (focus === source || focus === target)) ? styles.relationOn : focus ? styles.relationOff : "";
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} className={`${styles.relationPath} ${rel.proxy ? styles.relationProxyPath : ""} ${state}`} />
      <EdgeLabelRenderer>
        <div
          className={`${styles.relation} ${rel.proxy ? styles.relationProxy : ""} ${state}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          title={`${rel.proxy ? "Proxy: " : ""}${rel.verb} (${caps[cap] ?? cap})`}
        >
          {rel.proxy && <span className={styles.proxyTag}>proxy</span>}
          {rel.verb}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
const edgeTypes = { relation: RelationEdge };

const toFlow = (a: Architecture, blocks: Map<string, ArchBlock>, caps: Record<string, string>): { nodes: BlockNode[]; edges: Edge[] } => ({
  nodes: a.nodes
    .filter((n) => blocks.has(n.block))
    .map((n) => ({ id: n.id, type: "block", position: { x: n.x, y: n.y }, data: { block: blocks.get(n.block)!, label: n.label, caps, uses: [...new Set(a.edges.filter((e) => e.from === n.id).map((e) => e.capability))] } })),
  edges: a.edges.map((e) => ({ id: `${e.from}>${e.to}:${e.capability}`, type: "relation", source: e.from, target: e.to, sourceHandle: e.capability, targetHandle: e.capability })),
});
const fromFlow = (nodes: BlockNode[], edges: Edge[]): Architecture => ({
  nodes: nodes.map((n) => ({ id: n.id, block: n.data.block.id, label: n.data.label, x: n.position.x, y: n.position.y })),
  edges: edges.map((e) => ({ from: e.source, to: e.target, capability: String(e.sourceHandle) })),
});

function Board({ state, boardId }: { state: ArchitectureState; boardId: string }) {
  const blocks = useMemo(() => new Map([...state.services, ...state.components].map((b) => [b.id, b])), [state]);
  const initial = useMemo(() => toFlow(state.architecture, blocks, state.capabilities), [state, blocks]);
  const [nodes, setNodes, onNodesChange] = useNodesState<BlockNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [issues, setIssues] = useState<ArchIssue[]>(state.issues);
  const [saved, setSaved] = useState<"saved" | "saving" | "error" | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const selectedId = nodes.find((n) => n.selected)?.id ?? null;
  const focus = useMemo(() => ({ focus: hover ?? selectedId, caps: state.capabilities }), [hover, selectedId, state.capabilities]);
  const [query, setQuery] = useState("");
  const flow = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  // fit the board once its blocks are measured, and again whenever the canvas
  // changes size (the page settles around it), until you move the view yourself
  const measured = useNodesInitialized();
  const moved = useRef(false);
  useEffect(() => {
    if (!measured || !wrap.current) return;
    const fit = () => !moved.current && void flow.fitView({ maxZoom: 1, padding: 0.15 });
    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [measured, flow]);

  // save a moment after the last change; the answer carries what the check says
  const board = JSON.stringify(fromFlow(nodes, edges));
  const last = useRef(JSON.stringify(state.architecture));
  useEffect(() => {
    // measuring, selecting and marking blocks change nothing on disk
    if (board === last.current) return;
    last.current = board;
    setSaved("saving");
    const t = setTimeout(() => {
      client.saveArchitecture(JSON.parse(board) as Architecture, boardId).then(
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
      setEdges((es) => addEdge({ ...c, id: `${c.source}>${c.target}:${c.sourceHandle}` }, es)),
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
        return from && to ? addEdge({ id: `${from}>${to}:${l.capability}`, source: from, target: to, sourceHandle: l.capability, targetHandle: l.capability }, acc) : acc;
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
                <BlockLogo blockId={b.id} group={b.id.startsWith("service:") ? "service" : b.group} small />
                {b.name}
              </button>
            ))}
          </div>
        ))}
        {state.services.length === 0 && <p className={styles.hint}>Your services appear here once they are in the registry.</p>}
      </aside>

      <div className={`card ${styles.canvas}`} ref={wrap} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
        <FocusContext.Provider value={focus}>
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
          minZoom={0.2}
          defaultViewport={{ x: 40, y: 40, zoom: 1 }}
          proOptions={{ hideAttribution: true }}
          onMoveStart={(e) => {
            // a wheel, drag or pinch (not a fit) means you placed the view
            if (e) moved.current = true;
          }}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: "relation", markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 } }}
          onNodeMouseEnter={(_, n) => setHover(n.id)}
          onNodeMouseLeave={() => setHover(null)}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
        </FocusContext.Provider>
        {nodes.length === 0 && <p className={styles.empty}>Drag blocks here from the left, then join a need (right side) to a block that provides it (left side).</p>}
        <span className={styles.saved}>{saved === "saving" ? "Saving…" : saved === "saved" ? `Saved to ${boardId ? `architecture/${boardId}.json` : "architecture.json"}` : saved === "error" ? "Not saved" : ""}</span>
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
  return (
    <main className="page">
      <PageHeader
        title="Architecture"
        lede="Your services and the platforms they run on: one board for the whole project and one for each repository. Build one step by step with the wizard, or by hand; every block shows what it provides (left) and what it needs (right), only fitting pieces join, and Garry says what is missing or will not work."
      />
      {offline && <ServerNotice />}
      {!state && !offline && <Skeleton rows={2} height={200} />}
      {state && (
        <div className={styles.boardBar}>
          <span className="eyebrow">Board</span>
          <Select
            ariaLabel="board"
            value={boardId}
            onChange={(id) => setParams(id ? { board: id } : {})}
            options={state.boards.map((b) => ({ value: b.id, label: b.name, hint: b.blocks ? `${b.blocks} blocks` : "empty", group: b.id ? "Repositories" : undefined }))}
          />
          <span className={styles.boardBarFill} />
          {!showWizard && (
            <button className="btn btnSm" onClick={() => setWizardOpen(true)}>
              {state.architecture.wizard ? "Change the answers" : "Build with the wizard"}
            </button>
          )}
          {!empty && (
            <button className="btn btnSm btnGhost" onClick={() => void reset()}>
              Reset board
            </button>
          )}
        </div>
      )}
      {error && <span className="badge danger">{error}</span>}
      {state && showWizard && <Wizard key={`${boardId}:${version}`} state={state} boardName={boardName} onBuilt={replaced} onClose={empty ? undefined : () => setWizardOpen(false)} />}
      {state && state.templates.length > 0 && (
        <section className={styles.templates} aria-label="ready-made architectures">
          <div className={styles.templatesHead}>
            <span className="eyebrow">Or start from a ready-made architecture</span>
            <button className="btn btnSm btnGhost" aria-expanded={showTemplates} onClick={() => setShowTemplates(!showTemplates)}>
              {showTemplates ? "Hide" : "Show"}
            </button>
          </div>
          {showTemplates && (
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
        </section>
      )}
      {state && !showWizard && (
        <ReactFlowProvider key={`${boardId}:${version}`}>
          <Board state={state} boardId={boardId} />
        </ReactFlowProvider>
      )}
    </main>
  );
}
