import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConnectionProvider } from "../lib/connection";
import { usePalette } from "../lib/theme";

export default function Layout() {
  const p = usePalette();
  return (
    <SafeAreaProvider>
      <ConnectionProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: p.bg },
            headerTintColor: p.text,
            headerTitleStyle: { fontWeight: "800" },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: p.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Garry" }} />
          <Stack.Screen name="connect" options={{ title: "Connect", presentation: "modal" }} />
          <Stack.Screen name="feature/[id]" options={{ title: "Live agents" }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
          <Stack.Screen name="new" options={{ title: "New feature", presentation: "modal" }} />
          <Stack.Screen name="thread/[id]" options={{ title: "Work" }} />
        </Stack>
      </ConnectionProvider>
    </SafeAreaProvider>
  );
}
