import type { DeviceStore } from "../server/auth.js";
import type { ThreadManager } from "../threads/manager.js";
import { garryStatus, statusChanges, type GarryStatus, type StatusItem } from "./status.js";

/**
 * Push notifications through Expo when work comes to need you or is ready; off
 * unless a phone asks. GARRY_PUSH=off disables them, GARRY_PUSH_URL uses your own
 * relay, and GARRY_PUSH_DETAIL=minimal keeps project names on this computer.
 */

export const pushEnabled = () => (process.env.GARRY_PUSH ?? "").toLowerCase() !== "off";
const pushUrl = () => process.env.GARRY_PUSH_URL?.trim() || "https://exp.host/--/api/v2/push/send";
const minimal = () => (process.env.GARRY_PUSH_DETAIL ?? "").toLowerCase() === "minimal";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { threadId: string; state: StatusItem["state"] };
  sound?: "default";
}

export function messagesFor(changes: StatusItem[], tokens: string[]): PushMessage[] {
  return changes.flatMap((i) =>
    tokens.map((to) => ({
      to,
      title:
        i.state === "needs-you"
          ? minimal()
            ? "Garry needs you"
            : `Garry needs you: ${i.title}`
          : minimal()
            ? "Work is ready for review"
            : `Ready for review: ${i.title}`,
      body: minimal() ? "Open Garry to see it." : i.detail,
      data: { threadId: i.threadId, state: i.state },
      ...(i.state === "needs-you" ? { sound: "default" as const } : {}),
    })),
  );
}

/** Follows every thread and pushes what changed. Returns a stop function. */
export function startPushNotifier(threads: ThreadManager, devices: DeviceStore, opts: { onError?: (e: unknown) => void } = {}): () => void {
  let last: GarryStatus = garryStatus(threads);
  let pending: NodeJS.Timeout | null = null;
  const send = async () => {
    pending = null;
    const next = garryStatus(threads);
    const changes = statusChanges(last, next);
    last = next;
    if (!changes.length || !pushEnabled()) return;
    const tokens = devices.list().flatMap((d) => (d.pushToken ? [d.pushToken] : []));
    if (!tokens.length) return;
    try {
      const res = await fetch(pushUrl(), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(messagesFor(changes, tokens)),
      });
      if (!res.ok) throw new Error(`push service answered ${res.status}`);
    } catch (e) {
      opts.onError?.(e);
    }
  };
  const off = threads.subscribeAll(() => {
    if (!pending) pending = setTimeout(() => void send(), 300);
  });
  return () => {
    off();
    if (pending) clearTimeout(pending);
  };
}
