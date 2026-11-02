import { useEffect, useState } from "react";
import type { GarryStatus } from "garry-client";
import { client } from "./client";

/** One /api/status poll every few seconds however many components read it, and none while nobody does. */
let current: GarryStatus | null = null;
const listeners = new Set<(s: GarryStatus | null) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const poll = () =>
  client.status().then(
    (s) => {
      current = s;
      listeners.forEach((l) => l(s));
    },
    () => undefined,
  );

export function useGarryStatus(): GarryStatus | null {
  const [status, setStatus] = useState(current);
  useEffect(() => {
    listeners.add(setStatus);
    if (!timer) {
      void poll();
      timer = setInterval(poll, 4000);
    }
    return () => {
      listeners.delete(setStatus);
      if (!listeners.size && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return status;
}
