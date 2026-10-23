import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { monoFamily, usePalette } from "./theme";

// Small building blocks in the Garry style: square corners, hairline borders,
// uppercase labels, red only for what is live.

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const p = usePalette();
  return <View style={[s.card, { backgroundColor: p.surface, borderColor: p.line }, style]}>{children}</View>;
}

export function Label({ children, live }: { children: ReactNode; live?: boolean }) {
  const p = usePalette();
  return (
    <View style={s.row}>
      {live && <View style={[s.dot, { backgroundColor: p.accent }]} />}
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

export function Chip({ children, strong }: { children: ReactNode; strong?: boolean }) {
  const p = usePalette();
  return (
    <View style={[s.chip, { borderColor: p.line, backgroundColor: strong ? p.text : "transparent" }]}>
      <Text style={[s.chipText, { color: strong ? p.surface : p.text }]}>{children}</Text>
    </View>
  );
}

export function Button({ children, onPress, kind = "primary", disabled }: { children: ReactNode; onPress: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean }) {
  const p = usePalette();
  const bg = kind === "primary" ? p.text : "transparent";
  const fg = kind === "primary" ? p.surface : kind === "danger" ? p.accent : p.text;
  const border = kind === "danger" ? p.accent : p.line;
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      <Text style={[s.buttonText, { color: fg }]}>{children}</Text>
    </Pressable>
  );
}

export function Stages({ current }: { current: number }) {
  const p = usePalette();
  return (
    <View style={s.stages}>
      {Array.from({ length: 7 }, (_, i) => (
        <View key={i} style={[s.stage, { backgroundColor: i < current ? p.text : i === current ? p.accent : p.faint }]} />
      ))}
    </View>
  );
}

export function Loading() {
  const p = usePalette();
  return (
    <View style={s.center}>
      <ActivityIndicator color={p.text} />
    </View>
  );
}

export function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const p = usePalette();
  return (
    <View style={[s.notice, { borderColor: p.line }]}>
      <Body>{children}</Body>
      {action}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, padding: 16, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { fontSize: 18, fontWeight: "700", letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 21 },
  chip: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 12, fontFamily: monoFamily },
  button: { borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center" },
  buttonText: { fontSize: 13, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  stages: { flexDirection: "row", gap: 3 },
  stage: { flex: 1, height: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  notice: { borderWidth: 1, borderStyle: "dashed", padding: 16, gap: 12 },
});
