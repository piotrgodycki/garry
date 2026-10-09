export interface ModelInfo {
  id: string;
  label: string;
  tier: "opus" | "sonnet" | "haiku" | "fable";
}

/** The Claude models Garry can route to. Shown in the per service model picker. */
export const MODELS: ModelInfo[] = [
  { id: "claude-opus-4-8", label: "Opus 4.8", tier: "opus" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", tier: "sonnet" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", tier: "haiku" },
  { id: "claude-fable-5", label: "Fable 5", tier: "fable" },
];

export function isKnownModel(id: string): boolean {
  return MODELS.some((m) => m.id === id);
}
