import type { LogEntry, PairedDevice, StreamEvent, Task } from "./types";

/**
 * Reaching a Garry server: the fetch it uses, the error it answers with,
 * pairing a device from a QR code, and reading the plan's live stream.
 */
/** A fetch with the standard signature; React Native passes expo/fetch for streaming. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** The server, for example http://192.168.1.20:8123. Empty means the page's own origin. */
  baseUrl: string;
  /** The device token from pairing; a browser on the server's own origin needs none. */
  token?: string | null;
  fetch?: FetchLike;
}

export class GarryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
  /** True when this device has to pair (again): its token is missing, wrong or revoked. */
  get unpaired(): boolean {
    return this.status === 401;
  }
}

/** Where a pairing link (QR code) points: the server, and the one-time code. */
export function parsePairingLink(link: string): { baseUrl: string; code: string } | null {
  try {
    const url = new URL(link.trim());
    const code = url.searchParams.get("code");
    if (!code || url.pathname !== "/pair" || !/^https?:$/.test(url.protocol)) return null;
    return { baseUrl: url.origin, code };
  } catch {
    return null;
  }
}

/** Trades a pairing code for this device's token. */
export async function pair(baseUrl: string, code: string, name: string, f: FetchLike = fetch): Promise<{ token: string; device: PairedDevice }> {
  const res = await f(`${baseUrl}/api/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; device?: PairedDevice; error?: string };
  if (!res.ok || !body.token || !body.device) throw new GarryError(body.error ?? `pairing failed (${res.status})`, res.status);
  return { token: body.token, device: body.device };
}

/** Parses a server sent events body into Garry stream events. */
export function parseStream(chunk: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  const blocks = chunk.split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    let name = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    const payload = data ? (JSON.parse(data) as Record<string, unknown>) : {};
    if (name === "feature") events.push({ type: "feature", ...(payload as { id: string; title: string; order: string[] }) });
    else if (name === "task") events.push({ type: "task", ...(payload as { index: number; task: Task; text: string }) });
    else if (name === "log") events.push({ type: "log", entry: payload as unknown as LogEntry });
    else if (name === "done") events.push({ type: "done" });
  }
  return { events, rest };
}
