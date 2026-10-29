import { useEffect, useState } from "react";
import type { GarryStatus } from "garry-client";
import { client } from "./client";

/**
 * Garry at a glance (/api/status: how many agents need you, are working, have
 * something ready), shared by everything in the frame that shows it: one poll
 * every few seconds however many places read it, and none while nobody does.
 */
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
