import { Platform, useColorScheme } from "react-native";

// The Garry palette: black and white, signal red as the only accent.
const light = { bg: "#f7f7f7", surface: "#ffffff", text: "#0a0a0a", muted: "#6b6b6b", line: "#0a0a0a", faint: "#e5e5e5", accent: "#ff2200", ok: "#0a0a0a" };
const dark = { bg: "#0a0a0a", surface: "#141414", text: "#fafafa", muted: "#9a9a9a", line: "#fafafa", faint: "#2a2a2a", accent: "#ff2200", ok: "#fafafa" };

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export const monoFamily = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, monospace" });
export const mono = { fontFamily: monoFamily, fontVariant: ["tabular-nums" as const] };
export const STAGES = ["spec", "plan", "design", "implement", "review", "test", "integrate"] as const;
