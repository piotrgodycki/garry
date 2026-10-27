import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import * as Device from "expo-device";
import { fetch as expoFetch } from "expo/fetch";
import { GarryClient, pair, parsePairingLink, type FetchLike } from "garry-client";
import { loadConnection, saveConnection, type Connection } from "./storage";
import { biometricsEnabled, confirmWithBiometrics, setBiometricsEnabled } from "./biometrics";

/** Back from the background after this long, the app locks again. */
const RELOCK_AFTER_MS = 60_000;

// expo/fetch streams response bodies on iOS and Android (the live agent stream);
// the web build uses the browser's fetch.
const appFetch: FetchLike = Platform.OS === "web" ? (i, init) => fetch(i, init) : (expoFetch as unknown as FetchLike);

interface ConnectionState {
  ready: boolean;
  connection: Connection | null;
  client: GarryClient | null;
  /** Pairs with the server from a pairing link (QR code); throws with a readable message. */
  connect: (link: string) => Promise<void>;
  forget: () => Promise<void>;
  /** iOS with Face ID on: the app is locked until unlock() succeeds */
  locked: boolean;
  /** the app is in the app switcher: hide what is on screen */
  covered: boolean;
  unlock: () => Promise<void>;
  biometrics: boolean;
  setBiometrics: (on: boolean) => Promise<void>;
}

const Ctx = createContext<ConnectionState | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false);
  const [biometrics, setBiometricsState] = useState(false);
  const loaded = useRef(false);
  const backgroundAt = useRef(0);

  // On iOS with Face ID on, reading the key from the keychain is the unlock.
  const unlock = useCallback(async () => {
    try {
      if (!loaded.current) {
        setConnection(await loadConnection());
        loaded.current = true;
      } else if (!(await confirmWithBiometrics("Unlock Garry"))) return;
      setLocked(false);
    } catch {
      setLocked(true);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void biometricsEnabled().then(setBiometricsState);
    void unlock();
  }, [unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setCovered(state !== "active");
      if (state === "background") backgroundAt.current = Date.now();
      if (state === "active" && backgroundAt.current && Date.now() - backgroundAt.current > RELOCK_AFTER_MS) {
        void biometricsEnabled().then((on) => on && setLocked(true));
      }
    });
    return () => sub.remove();
  }, []);

  const setBiometrics = useCallback(
    async (on: boolean) => {
      if (!(await confirmWithBiometrics(on ? "Turn on Face ID for Garry" : "Turn off Face ID for Garry"))) return;
      // the keychain item is written again with or without the Face ID requirement
      await saveConnection(null);
      await setBiometricsEnabled(on);
      if (connection) await saveConnection(connection);
      setBiometricsState(on);
    },
    [connection],
  );

  const connect = useCallback(async (link: string) => {
    const target = parsePairingLink(link);
    if (!target) throw new Error("That is not a Garry pairing link. Run garry pair on your computer for a new one.");
    const name = Device.deviceName ?? Device.modelName ?? (Platform.OS === "ios" ? "iPhone" : "Android phone");
    const { token, device } = await pair(target.baseUrl, target.code, name, appFetch);
    const c = { baseUrl: target.baseUrl, token, deviceId: device.id };
    await saveConnection(c);
    setConnection(c);
  }, []);

  const forget = useCallback(async () => {
    await saveConnection(null);
    setConnection(null);
  }, []);

  const client = useMemo(() => (connection ? new GarryClient({ baseUrl: connection.baseUrl, token: connection.token, fetch: appFetch }) : null), [connection]);
  const value = useMemo(
    () => ({ ready, connection, client, connect, forget, locked, covered, unlock, biometrics, setBiometrics }),
    [ready, connection, client, connect, forget, locked, covered, unlock, biometrics, setBiometrics],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConnection(): ConnectionState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConnection outside ConnectionProvider");
  return v;
}
