import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { biometricsEnabled } from "./biometrics";

// The server address and this device's token. On a phone the token lives in the
// keychain or keystore (expo-secure-store); on iOS with Face ID on, the keychain
// item itself requires Face ID to read, so the key cannot be taken from an
// unlocked phone without it. The web build, for development only, uses
// localStorage.
export interface Connection {
  baseUrl: string;
  token: string;
  deviceId: string;
}

const KEY = "garry.connection";
const opts = async (): Promise<SecureStore.SecureStoreOptions> =>
  (await biometricsEnabled()) ? { requireAuthentication: true, authenticationPrompt: "Unlock Garry" } : {};

/** Reads the connection; on iOS with Face ID on, this is the Face ID prompt. Throws when it is cancelled. */
export async function loadConnection(): Promise<Connection | null> {
  const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY, await opts());
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
  if (c) await SecureStore.setItemAsync(KEY, JSON.stringify(c), await opts());
  else await SecureStore.deleteItemAsync(KEY);
}
