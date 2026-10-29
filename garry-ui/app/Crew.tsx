import type { ReactNode } from "react";
import GarryMark from "./GarryMark";

/**
 * Garry's crew: one icon per role, so on the timeline and in what needs you
 * it is plain who works. The analyst writes the spec and plan (a page with
 * its lines), the developer the code (brackets), the reviewer checks it (a
 * lens with a tick). The tile is the state's colour; a failure carries a red
 * mark, a queued one is faded. Garry himself is his mark on a clay tile.
 * Drawn from the theme's tokens, so both themes work.
 */
export type CrewRole = "garry" | "analyst" | "dev" | "reviewer";
export type CrewState = "plan" | "work" | "wait" | "done" | "fail" | "idle";

/** The role behind an agent's name (garry-analyst, garry-dev, garry-reviewer); a Build agent is a developer. */
export function roleOf(agent: string | null | undefined): CrewRole {
  const a = (agent ?? "").toLowerCase();
  if (a === "garry" || a === "garry-orchestrator") return "garry";
  if (a.includes("analyst")) return "analyst";
  if (a.includes("review")) return "reviewer";
  return "dev";
}

/** Each role's tool, on the 24px grid with the 1.7 stroke of the rest of the icons. */
const TOOL: Record<Exclude<CrewRole, "garry">, { name: string; draw: ReactNode }> = {
  analyst: { name: "spec", draw: <path d="M6.5 3.5h7.5l4 4v13h-11.5zM14 3.5v4h4M9.5 11.5h5M9.5 14.5h5M9.5 17.5h3" /> },
  dev: { name: "code", draw: <path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5.5l-3 13" /> },
  reviewer: { name: "review", draw: <path d="M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13zM15.3 15.3L20 20M7.8 10.6l1.9 1.9 3.5-3.6" /> },
};

export default function CrewFace({ role, state, size = 30, title }: { role: CrewRole; state: CrewState; size?: number; title?: string }) {
  const tone = role === "garry" ? "var(--garry-clay)" : `var(--state-${state})`;
  const a11y = { role: title ? "img" : undefined, "aria-label": title, "aria-hidden": title ? undefined : true };
  return (
    <span
      {...a11y}
      data-crew={role}
      data-state={state}
      data-tool={role === "garry" ? "mark" : TOOL[role].name}
      style={{
        position: "relative",
        flex: "none",
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        borderRadius: size * 0.28,
        color: tone,
        background: `color-mix(in srgb, ${tone} 16%, var(--surface))`,
        border: `1px solid color-mix(in srgb, ${tone} 34%, var(--border))`,
        opacity: state === "idle" ? 0.6 : 1,
        boxSizing: "border-box",
      }}
    >
      {role === "garry" ? (
        <GarryMark size={Math.round(size * 0.72)} busy={state === "work"} />
      ) : (
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {TOOL[role].draw}
        </svg>
      )}
      {state === "fail" && (
        <span
          data-badge="fail"
          style={{ position: "absolute", top: -3, right: -3, width: 11, height: 11, borderRadius: "50%", background: "var(--state-fail)", border: "2px solid var(--surface)", color: "#fff", font: "700 7px/7px var(--font-family-sans)", textAlign: "center" }}
        >
          !
        </span>
      )}
    </span>
  );
}
