import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import type { GarryClient } from "garry-client";

/**
 * Notifications from Garry: this phone asks the Garry server on your computer
 * to tell it when work needs you or is ready. The server sends them through
 * Expo's push service (or your company's own, see GARRY_PUSH_URL), so they
 * arrive with the app closed. Off until you turn it on in Settings.
 */

const KEY = "garry.push";

// show them while the app is open too, quietly unless Garry needs you
Notifications.setNotificationHandler({
  handleNotification: async (n) => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: (n.request.content.data as { state?: string } | undefined)?.state === "needs-you",
    shouldSetBadge: false,
  }),
});

export async function pushWanted(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  return (await SecureStore.getItemAsync(KEY)) === "on";
}

/** Asks for permission, gets this phone's push token and hands it to the server. */
export async function enablePush(client: GarryClient): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (Platform.OS === "web" || !Device.isDevice) return { ok: false, reason: "Notifications work on a real iPhone, not in a simulator or the browser." };
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return { ok: false, reason: "Notifications are off for Garry in iOS Settings." };
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: "This build has no EAS project id (eas init), so it cannot receive notifications." };
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const r = await client.setPushToken(token);
  await SecureStore.setItemAsync(KEY, "on");
  return r.enabled ? { ok: true } : { ok: false, reason: "Garry on your computer has notifications turned off (GARRY_PUSH=off)." };
}

export async function disablePush(client: GarryClient | null): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
  await client?.setPushToken(null).catch(() => undefined);
}

/** The thread a tapped notification is about. */
export function threadOf(response: Notifications.NotificationResponse): string | null {
  const id = (response.notification.request.content.data as { threadId?: unknown } | undefined)?.threadId;
  return typeof id === "string" && /^[a-z0-9]{4,16}$/.test(id) ? id : null;
}
