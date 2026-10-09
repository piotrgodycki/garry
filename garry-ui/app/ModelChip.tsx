import styles from "./modelchip.module.css";

const TIER_COLOR: Record<string, string> = {
  opus: "#7c3aed",
  sonnet: "#0ea5e9",
  haiku: "#16a34a",
  fable: "#db2777",
};

/** Infers the tier from a model id so the chip can be colored without extra data. */
export function tierOf(modelId: string): string {
  if (modelId.includes("opus")) return "opus";
  if (modelId.includes("sonnet")) return "sonnet";
  if (modelId.includes("haiku")) return "haiku";
  if (modelId.includes("fable")) return "fable";
  return "sonnet";
}

/** A model chip with a small tier colored spark logo and the model label. */
export default function ModelChip({ id, label }: { id: string; label: string }) {
  const color = TIER_COLOR[tierOf(id)] ?? TIER_COLOR.sonnet;
  return (
    <span className={styles.chip} style={{ color, background: `color-mix(in srgb, ${color} 12%, var(--tint-base))` }}>
      <svg className={styles.spark} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
        <path d="M8 0l1.9 4.9L15 7l-5.1 2.1L8 14l-1.9-4.9L1 7l5.1-2.1z" />
      </svg>
      {label}
    </span>
  );
}
