import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Handle, Position, useReactFlow, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import type { ArchBlock, Architecture } from "garry-client";
import styles from "./architecture.module.css";
import { isDark, logoOf } from "./logos";
import { relationOf } from "./relations";

/**
 * The pieces of an architecture board: a block (a puzzle piece with what it
 * provides on the left and what it needs on the right), its logo, a relation
 * between two blocks, and the board to and from React Flow's nodes and edges.
 */
// the block's header, then one row per port
export const HEAD = 58;
export const ROW = 26;

export type BlockData = { block: ArchBlock; label?: string; caps: Record<string, string>; level?: "error" | "warn"; uses?: string[] };
export type BlockNode = Node<BlockData, "block">;

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
export function BlockLogo({ blockId, group, small }: { blockId: string; group: string; small?: boolean }) {
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
export function BlockCard({ data, selected }: NodeProps<BlockNode>) {
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
export const nodeTypes = { block: BlockCard };

/** The block being pointed at or selected: its relations stand out, the rest step back. */
export const FocusContext = createContext<{ focus: string | null; caps: Record<string, string> }>({ focus: null, caps: {} });

/** A relation: from the block that needs to the block that provides, with what flows between them. */
export function RelationEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, sourceHandleId, markerEnd, style, selected }: EdgeProps) {
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
export const edgeTypes = { relation: RelationEdge };

export const toFlow = (a: Architecture, blocks: Map<string, ArchBlock>, caps: Record<string, string>): { nodes: BlockNode[]; edges: Edge[] } => ({
  nodes: a.nodes
    .filter((n) => blocks.has(n.block))
    .map((n) => ({ id: n.id, type: "block", position: { x: n.x, y: n.y }, data: { block: blocks.get(n.block)!, label: n.label, caps, uses: [...new Set(a.edges.filter((e) => e.from === n.id).map((e) => e.capability))] } })),
  edges: a.edges.map((e) => ({ id: `${e.from}>${e.to}:${e.capability}`, type: "relation", source: e.from, target: e.to, sourceHandle: e.capability, targetHandle: e.capability })),
});
export const fromFlow = (nodes: BlockNode[], edges: Edge[]): Architecture => ({
  nodes: nodes.map((n) => ({ id: n.id, block: n.data.block.id, label: n.data.label, x: n.position.x, y: n.position.y })),
  edges: edges.map((e) => ({ from: e.source, to: e.target, capability: String(e.sourceHandle) })),
});
