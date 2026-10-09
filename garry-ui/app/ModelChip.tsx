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

/** A clean model chip: a tier colored dot plus the model label. */
export default function ModelChip({ id, label }: { id: string; label: string }) {
  const color = TIER_COLOR[tierOf(id)] ?? TIER_COLOR.sonnet;
  return (
    <span className={styles.chip}>
      <span className={styles.dot} style={{ background: color }} />
      {label}
    </span>
  );
}
