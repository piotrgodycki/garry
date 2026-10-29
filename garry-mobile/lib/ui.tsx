import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { monoFamily, tint, usePalette, type State } from "./theme";

// Small building blocks in Garry's calm style: soft corners, quiet borders,
// sentence case, and colour only where it says what state something is in.

export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: State }) {
  const p = usePalette();
  const border = tone ? tint(p[tone], p.line, 0.45) : p.line;
  return <View style={[s.card, { backgroundColor: p.surface, borderColor: border }, style]}>{children}</View>;
}

export function Label({ children, live }: { children: ReactNode; live?: boolean }) {
  const p = usePalette();
  return (
    <View style={s.row}>
      {live && <View style={[s.dot, { backgroundColor: p.work }]} />}
      <Text style={[s.label, { color: p.muted }]}>{children}</Text>
    </View>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const p = usePalette();
  return <Text style={[s.title, { color: p.text }, style]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: TextStyle }) {
  const p = usePalette();
  return <Text style={[s.body, { color: muted ? p.muted : p.text }, style]}>{children}</Text>;
}

/** A name in a box; strong when it is picked. */
export function Chip({ children, strong }: { children: ReactNode; strong?: boolean }) {
  const p = usePalette();
  return (
    <View style={[s.chip, { borderColor: strong ? p.primary : p.line, backgroundColor: strong ? p.primary : p.surface2 }]}>
      <Text style={[s.chipText, { color: strong ? p.onPrimary : p.text }]}>{children}</Text>
    </View>
  );
}

/** A state in words, on a soft tile of its colour. */
export function Pill({ state, children }: { state: State; children: ReactNode }) {
  const p = usePalette();
  return (
    <View accessibilityRole="text" style={[s.pill, { backgroundColor: tint(p[state], p.surface, 0.14), borderColor: tint(p[state], p.surface, 0.4) }]}>
      <View style={[s.pillDot, { backgroundColor: p[state] }]} />
      <Text style={[s.pillText, { color: p[state] }]}>{children}</Text>
    </View>
  );
}

export function Button({ children, onPress, kind = "primary", disabled, label }: { children: ReactNode; onPress: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean; label?: string }) {
  const p = usePalette();
  const bg = kind === "primary" ? p.primary : kind === "danger" ? tint(p.fail, p.surface, 0.1) : p.surface;
  const fg = kind === "primary" ? p.onPrimary : kind === "danger" ? p.fail : p.text;
  const border = kind === "primary" ? p.primary : kind === "danger" ? tint(p.fail, p.surface, 0.45) : p.lineStrong;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}>
      <Text style={[s.buttonText, { color: fg }]}>{children}</Text>
    </Pressable>
  );
}

export function Stages({ current }: { current: number }) {
  const p = usePalette();
  return (
    <View style={s.stages}>
      {Array.from({ length: 7 }, (_, i) => (
        <View key={i} style={[s.stage, { backgroundColor: i < current ? p.done : i === current ? p.work : p.surface3 }]} />
      ))}
    </View>
  );
}

export function Loading() {
  const p = usePalette();
  return (
    <View style={s.center}>
      <ActivityIndicator color={p.muted} />
    </View>
  );
}

export function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const p = usePalette();
  return (
    <View style={[s.notice, { borderColor: p.lineStrong }]}>
      <Body>{children}</Body>
      {action}
    </View>
  );
}

export type CrewRole = "analyst" | "dev" | "reviewer";

/** The role behind an agent's name (garry-analyst, garry-dev, garry-reviewer), as on the dashboard. */
export function roleOf(agent: string | null | undefined): CrewRole {
  const a = (agent ?? "").toLowerCase();
  return a.includes("analyst") ? "analyst" : a.includes("review") ? "reviewer" : "dev";
}

/**
 * One of Garry's crew, the same as the dashboard's (garry-ui/app/Crew.tsx): the
 * role's icon (the analyst's spec, the developer's code, the reviewer's lens)
 * on a tile in the state's colour; a failure carries a red mark, a queued one
 * is faded.
 */
const TOOL: Record<CrewRole, string> = {
  analyst: "M6.5 3.5h7.5l4 4v13h-11.5zM14 3.5v4h4M9.5 11.5h5M9.5 14.5h5M9.5 17.5h3",
  dev: "M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5.5l-3 13",
  reviewer: "M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13zM15.3 15.3L20 20M7.8 10.6l1.9 1.9 3.5-3.6",
};

export function CrewFace({ role = "dev", state, size = 34 }: { role?: CrewRole; state: State; size?: number }) {
  const p = usePalette();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`crew-${role}-${state}`}
      style={{ width: size, height: size, borderRadius: size * 0.28, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: tint(p[state], p.surface, 0.16), borderColor: tint(p[state], p.line, 0.34), opacity: state === "idle" ? 0.6 : 1 }}
    >
      <Svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">
        <Path d={TOOL[role]} stroke={p[state]} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
      {state === "fail" && <View style={{ position: "absolute", top: -3, right: -3, width: 11, height: 11, borderRadius: 6, backgroundColor: p.fail, borderWidth: 2, borderColor: p.surface }} />}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 13, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21 },
  chip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { fontSize: 12, fontFamily: monoFamily },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 12.5, fontWeight: "600" },
  button: { borderWidth: 1, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center" },
  buttonText: { fontSize: 15, fontWeight: "600" },
  stages: { flexDirection: "row", gap: 3 },
  stage: { flex: 1, height: 5, borderRadius: 3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  notice: { borderWidth: 1, borderStyle: "dashed", borderRadius: 12, padding: 16, gap: 12 },
});
