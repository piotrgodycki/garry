import { Platform, useColorScheme } from "react-native";

// The Garry palette, the same as the dashboard's (garry-ui/app/globals.css):
// paper by day, graphite by night, colour only where it means a state
// (working, needs you, ready, failed, planning, queued), and Garry's own clay
// for the brand and for talking to him. test:style checks every pair reads.
const light = {
  bg: "#f3f4f6",
  surface: "#ffffff",
  surface2: "#fafbfc",
  surface3: "#eef0f3",
  text: "#17181b",
  muted: "#5f6570",
  line: "#e4e6ea",
  lineStrong: "#cfd3da",
  faint: "#eef0f3",
  primary: "#17181b",
  onPrimary: "#ffffff",
  work: "#2361c7",
  wait: "#8f5508",
  done: "#187841",
  fail: "#c7372e",
  plan: "#6a56d4",
  idle: "#7a818c",
  worm: "#ee9b86",
  ring: "#c47562",
  clay: "#d9573a",
  ink: "#2a1d19",
  soil: "#e8ddd2",
  soil2: "#d9c9ba",
  leaf: "#3f9b52",
};
const dark: Palette = {
  bg: "#111214",
  surface: "#17181b",
  surface2: "#1b1d21",
  surface3: "#23262b",
  text: "#ecedef",
  muted: "#9ba1ab",
  line: "#26292f",
  lineStrong: "#363a42",
  faint: "#23262b",
  primary: "#ecedef",
  onPrimary: "#17181b",
  work: "#5b9df5",
  wait: "#e9a23b",
  done: "#4cb782",
  fail: "#e5574f",
  plan: "#9d8cf2",
  idle: "#7c838e",
  worm: "#ee9b86",
  ring: "#c47562",
  clay: "#d9573a",
  ink: "#2a1d19",
  soil: "#2a2420",
  soil2: "#352d27",
  leaf: "#63b072",
};

export type Palette = typeof light;
export type State = "work" | "wait" | "done" | "fail" | "plan" | "idle";

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

/** A colour at some strength over a surface, for soft tiles and badges (React Native has no color-mix). */
export function tint(hex: string, over: string, amount: number): string {
  const c = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [c(hex), c(over)];
  return `#${a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

export const monoFamily = Platform.select({ ios: "Menlo", android: "monospace", default: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace" });
export const mono = { fontFamily: monoFamily, fontVariant: ["tabular-nums" as const] };
export const STAGES = ["spec", "plan", "design", "implement", "review", "test", "integrate"] as const;
export { light as lightPalette, dark as darkPalette };
