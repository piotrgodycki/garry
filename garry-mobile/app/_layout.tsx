import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { threadOf } from "../lib/push";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConnectionProvider } from "../lib/connection";
import { LockGate } from "../lib/LockGate";
import { usePalette } from "../lib/theme";

/** A tapped notification opens the work it is about. */
function OpenFromNotifications() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === "web") return;
    const open = (r: Notifications.NotificationResponse | null) => {
      const id = r && threadOf(r);
      if (id) router.push({ pathname: "/thread/[id]", params: { id } });
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
  return null;
}

export default function Layout() {
  const p = usePalette();
  return (
    <SafeAreaProvider>
      <ConnectionProvider>
        <StatusBar style="auto" />
        <OpenFromNotifications />
        <LockGate>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: p.bg },
            headerTintColor: p.text,
            headerTitleStyle: { fontWeight: "600" },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: p.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Garry" }} />
          <Stack.Screen name="connect" options={{ title: "Connect", presentation: "modal" }} />
          <Stack.Screen name="feature/[id]" options={{ title: "Feature" }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
          <Stack.Screen name="new" options={{ title: "New work", presentation: "modal" }} />
          <Stack.Screen name="feature/new" options={{ title: "New feature", presentation: "modal" }} />
          <Stack.Screen name="thread/[id]" options={{ title: "Work" }} />
        </Stack>
        </LockGate>
      </ConnectionProvider>
    </SafeAreaProvider>
  );
}
