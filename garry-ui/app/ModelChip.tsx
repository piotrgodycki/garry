/** Infers the tier from a model id so the chip can be colored without extra data. */
export function tierOf(modelId: string): string {
  if (modelId.includes("opus")) return "opus";
  if (modelId.includes("sonnet")) return "sonnet";
  if (modelId.includes("haiku")) return "haiku";
  if (modelId.includes("fable")) return "fable";
  return "sonnet";
}

/** The models a picker offers: the current generation, plus an older one only while it is the one chosen. */
export function offered<M extends { id: string; previous?: boolean }>(models: M[], chosen: string): M[] {
  return models.filter((m) => !m.previous || m.id === chosen);
}

/** A model chip: a tier colored dot (tokens in globals.css) plus the model label. */
export default function ModelChip({ id, label }: { id: string; label: string }) {
  if (!label) return null;
  return (
    <span className="chip" title={id}>
      <span className={`tier ${tierOf(id)}`} />
      {label}
    </span>
  );
}
