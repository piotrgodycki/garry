import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from "react-native-svg";
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
 * One of Garry's crew, the same faces as the dashboard's (garry-ui/app/Crew.tsx):
 * the analyst's glasses, the developer's headphones, the reviewer's lens, on a
 * tile in the state's colour; crossed eyes when it failed, asleep when queued.
 */
export function CrewFace({ role = "dev", state, size = 34 }: { role?: CrewRole; state: State; size?: number }) {
  const p = usePalette();
  const eyes =
    state === "fail" ? (
      <Path d="M14.4 20.4l3 3M17.4 20.4l-3 3M22.6 20.4l3 3M25.6 20.4l-3 3" stroke={p.ink} strokeWidth={1.6} strokeLinecap="round" fill="none" />
    ) : state === "idle" ? (
      <Path d="M14.2 22.2q1.8 1.4 3.6 0M22.2 22.2q1.8 1.4 3.6 0" stroke={p.ink} strokeWidth={1.6} strokeLinecap="round" fill="none" />
    ) : (
      <>
        <Circle cx={16} cy={22} r={1.6} fill={p.ink} />
        <Circle cx={24} cy={22} r={1.6} fill={p.ink} />
      </>
    );
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`crew-${role}-${state}`}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Defs>
          <ClipPath id="tile">
            <Rect width={40} height={40} rx={11} />
          </ClipPath>
        </Defs>
        <Rect width={40} height={40} rx={11} fill={tint(p[state], p.surface2, 0.24)} />
        <G clipPath="url(#tile)">
          <Ellipse cx={20} cy={24} rx={11} ry={12} fill={p.worm} />
          <Path d="M9.6 28.5Q20 33.5 30.4 28.5M11.4 32.6Q20 37 28.6 32.6" stroke={p.ring} strokeWidth={1.6} fill="none" />
          <Circle cx={13.6} cy={26} r={1.7} fill={p.clay} opacity={0.45} />
          <Circle cx={26.4} cy={26} r={1.7} fill={p.clay} opacity={0.45} />
          {eyes}
          {role === "analyst" && (
            <G stroke={p.ink} strokeWidth={1.8} fill="none">
              <Circle cx={16} cy={21.8} r={3.6} />
              <Circle cx={24} cy={21.8} r={3.6} />
              <Path d="M19.6 21.4h.8" />
            </G>
          )}
          {role === "dev" && (
            <G>
              <Path d="M8.6 23a11.4 12 0 0 1 22.8 0" stroke={p.ink} strokeWidth={2.2} fill="none" strokeLinecap="round" />
              <Rect x={6.4} y={21} width={4.4} height={7.4} rx={2.2} fill={p.ink} />
              <Rect x={29.2} y={21} width={4.4} height={7.4} rx={2.2} fill={p.ink} />
            </G>
          )}
          {role === "reviewer" && (
            <G stroke={p.ink} fill="none" strokeLinecap="round">
              <Circle cx={28.6} cy={28.4} r={4.6} strokeWidth={2} />
              <Path d="M31.9 31.7l3.4 3.4" strokeWidth={2.4} />
            </G>
          )}
        </G>
      </Svg>
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
