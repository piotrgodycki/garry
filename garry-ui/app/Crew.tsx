import { useId } from "react";
import GarryMark from "./GarryMark";

/**
 * Garry's crew: one earthworm per role, each with its tool, so on the
 * timeline and in what needs you it is plain who speaks. The analyst wears
 * glasses (spec and plan), the developer headphones (code and tests), the
 * reviewer holds a lens (reviews). The tile behind the face is the state's
 * colour; a failure crosses the eyes, a queued one sleeps. Garry himself is
 * the mark on a clay tile. Drawn from the theme's tokens, so both themes work.
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

export default function CrewFace({ role, state, size = 30, title }: { role: CrewRole; state: CrewState; size?: number; title?: string }) {
  const clip = useId();
  const tile = role === "garry" ? "var(--garry-clay)" : `var(--state-${state})`;
  const ink = "var(--garry-ink)";
  const ring = "var(--garry-ring)";
  const eyes =
    state === "fail" ? (
      <path d="M14.4 20.4l3 3M17.4 20.4l-3 3M22.6 20.4l3 3M25.6 20.4l-3 3" stroke={ink} strokeWidth="1.6" strokeLinecap="round" fill="none" />
    ) : state === "idle" ? (
      <path d="M14.2 22.2q1.8 1.4 3.6 0M22.2 22.2q1.8 1.4 3.6 0" stroke={ink} strokeWidth="1.6" strokeLinecap="round" fill="none" />
    ) : (
      <>
        <circle cx="16" cy="22" r="1.6" fill={ink} />
        <circle cx="24" cy="22" r="1.6" fill={ink} />
      </>
    );
  const tool =
    role === "analyst" ? (
      <g data-tool="glasses" stroke={ink} strokeWidth="1.8" fill="none">
        <circle cx="16" cy="21.8" r="3.6" />
        <circle cx="24" cy="21.8" r="3.6" />
        <path d="M19.6 21.4h.8" />
      </g>
    ) : role === "dev" ? (
      <g data-tool="headphones">
        <path d="M8.6 23a11.4 12 0 0 1 22.8 0" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <rect x="6.4" y="21" width="4.4" height="7.4" rx="2.2" fill={ink} />
        <rect x="29.2" y="21" width="4.4" height="7.4" rx="2.2" fill={ink} />
      </g>
    ) : role === "reviewer" ? (
      <g data-tool="lens" stroke={ink} fill="none" strokeLinecap="round">
        <circle cx="28.6" cy="28.4" r="4.6" strokeWidth="2" />
        <path d="M31.9 31.7l3.4 3.4" strokeWidth="2.4" />
      </g>
    ) : null;
  const tileFill = `color-mix(in srgb, ${tile} 24%, var(--surface-2))`;
  if (role === "garry")
    return (
      <span role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} data-crew={role} data-state={state} style={{ flex: "none", display: "grid", placeItems: "center", width: size, height: size, borderRadius: size * 0.275, background: tileFill }}>
        <GarryMark size={Math.round(size * 0.75)} busy={state === "work"} />
      </span>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} data-crew={role} data-state={state} style={{ flex: "none", display: "block" }}>
      <defs>
        <clipPath id={clip}>
          <rect width="40" height="40" rx="11" />
        </clipPath>
      </defs>
      <rect width="40" height="40" rx="11" fill={tileFill} />
      <g clipPath={`url(#${clip})`}>
        <ellipse cx="20" cy="24" rx="11" ry="12" fill="var(--garry-worm)" />
        <path d="M9.6 28.5Q20 33.5 30.4 28.5M11.4 32.6Q20 37 28.6 32.6" stroke={ring} strokeWidth="1.6" fill="none" />
        <circle cx="13.6" cy="26" r="1.7" fill="var(--garry-clay)" opacity="0.45" />
        <circle cx="26.4" cy="26" r="1.7" fill="var(--garry-clay)" opacity="0.45" />
        {eyes}
        {tool}
      </g>
    </svg>
  );
}
