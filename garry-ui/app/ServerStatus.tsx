"use client";
import { useEffect, useState } from "react";
import { apiBase } from "./lib/api";

/** A quiet, always visible answer to "is the backend up?", polled every 15 seconds. */
export default function ServerStatus() {
  const [up, setUp] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch(`${apiBase}/api/features`, { cache: "no-store" })
        .then((r) => alive && setUp(r.ok))
        .catch(() => alive && setUp(false));
    check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const cls = up === null ? "wait" : up ? "ok" : "danger";
  const label = up === null ? "Connecting" : up ? "Server online" : "Server offline";
  return (
    <span className="serverStatus" title={apiBase}>
      <span className={`dot ${cls}`} />
      {label}
    </span>
  );
}
