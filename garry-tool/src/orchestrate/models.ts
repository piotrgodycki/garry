export interface ModelInfo {
  id: string;
  label: string;
  tier: "opus" | "sonnet" | "haiku" | "fable";
  /** An earlier generation: profiles that name it keep working, pickers offer it only where it is already chosen. */
  previous?: boolean;
}

/** The Claude models Garry can route to, newest first. Shown in the model pickers. */
export const MODELS: ModelInfo[] = [
  { id: "claude-opus-5-5", label: "Opus 5.5", tier: "opus" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", tier: "sonnet" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5", tier: "haiku" },
  { id: "claude-fable-5-1", label: "Fable 5.1", tier: "fable" },
  { id: "claude-opus-4-8", label: "Opus 4.8", tier: "opus", previous: true },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", tier: "sonnet", previous: true },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", tier: "haiku", previous: true },
  { id: "claude-fable-5", label: "Fable 5", tier: "fable", previous: true },
];

export function isKnownModel(id: string): boolean {
  return MODELS.some((m) => m.id === id);
}
