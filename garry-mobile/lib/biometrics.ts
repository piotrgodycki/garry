import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

/**
 * Face ID (or Touch ID) on iOS: unlocks the app, guards the key to the
 * computer in the keychain, and confirms the actions that change code. Other
 * platforms are unchanged for now. On by default on iOS; Settings turns it off.
 */

export const biometricsSupported = Platform.OS === "ios";
const SETTING = "garry.biometrics";

export async function biometricsEnabled(): Promise<boolean> {
  if (!biometricsSupported) return false;
  return (await SecureStore.getItemAsync(SETTING)) !== "off";
}

export async function setBiometricsEnabled(on: boolean): Promise<void> {
  await SecureStore.setItemAsync(SETTING, on ? "on" : "off");
}

/** Asks for Face ID (the device passcode is the fallback). True when there is nothing to ask. */
export async function confirmWithBiometrics(reason: string): Promise<boolean> {
  if (!(await biometricsEnabled())) return true;
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: reason, fallbackLabel: "Use passcode", cancelLabel: "Cancel" });
  return r.success;
}

/** What the lock screen calls the method: "Face ID", "Touch ID" or "passcode". */
export async function biometricLabel(): Promise<string> {
  const types: LocalAuthentication.AuthenticationType[] = await LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []);
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "Face ID";
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "Touch ID";
  return "passcode";
}
