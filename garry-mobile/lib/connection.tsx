import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import { fetch as expoFetch } from "expo/fetch";
import { GarryClient, pair, parsePairingLink, type FetchLike } from "garry-client";
import { loadConnection, saveConnection, type Connection } from "./storage";

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
}

const Ctx = createContext<ConnectionState | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);

  useEffect(() => {
    loadConnection()
      .then(setConnection)
      .finally(() => setReady(true));
  }, []);

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
  const value = useMemo(() => ({ ready, connection, client, connect, forget }), [ready, connection, client, connect, forget]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConnection(): ConnectionState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConnection outside ConnectionProvider");
  return v;
}
