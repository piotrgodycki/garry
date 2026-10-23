import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// The server address and this device's token. On a phone the token lives in the
// keychain or keystore (expo-secure-store); the web build, for development only,
// uses localStorage.
export interface Connection {
  baseUrl: string;
  token: string;
  deviceId: string;
}

const KEY = "garry.connection";

export async function loadConnection(): Promise<Connection | null> {
  const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Connection;
  } catch {
    return null;
  }
}

export async function saveConnection(c: Connection | null): Promise<void> {
  if (Platform.OS === "web") {
    if (c) globalThis.localStorage?.setItem(KEY, JSON.stringify(c));
    else globalThis.localStorage?.removeItem(KEY);
    return;
  }
  if (c) await SecureStore.setItemAsync(KEY, JSON.stringify(c));
  else await SecureStore.deleteItemAsync(KEY);
}
