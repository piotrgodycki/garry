import { useEffect, useState, type ReactNode } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useConnection } from "./connection";
import { biometricLabel } from "./biometrics";
import { usePalette } from "./theme";
import { Body, Button, Title } from "./ui";

/**
 * Nothing of Garry shows while the app is locked (iOS, Face ID on), and the
 * screen is covered while the app is in the app switcher.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { ready, locked, covered, unlock } = useConnection();
  const p = usePalette();
  const [method, setMethod] = useState("Face ID");
  useEffect(() => void biometricLabel().then(setMethod), []);

  if (!ready) return <View style={[s.fill, { backgroundColor: p.bg }]} />;
  if (locked) {
    return (
      <View style={[s.fill, s.center, { backgroundColor: p.bg }]}>
        <Image source={require("../assets/icon.png")} style={s.icon} accessibilityIgnoresInvertColors />
        <Title style={{ fontSize: 22 }}>Garry is locked</Title>
        <Body muted>Unlock with {method} to see your work.</Body>
        <View style={{ alignSelf: "stretch" }}>
          <Button onPress={() => void unlock()}>Unlock with {method}</Button>
        </View>
      </View>
    );
  }
  return (
    <View style={s.fill}>
      {children}
      {covered && <View style={[StyleSheet.absoluteFill, s.center, { backgroundColor: p.bg }]}><Image source={require("../assets/icon.png")} style={s.icon} /></View>}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 14, padding: 32 },
  icon: { width: 96, height: 96 },
});
