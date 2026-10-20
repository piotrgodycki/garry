"use client";
import { useEffect, useState } from "react";
import { apiBase, api } from "./lib/api";

/** A quiet, always visible answer to "is the backend up?", polled every 15 seconds. */
export default function ServerStatus() {
  const [up, setUp] = useState<boolean | "locked" | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () =>
      api(`/api/features`, { cache: "no-store" }, { silent: true })
        .then((r) => alive && setUp(r.status === 401 ? "locked" : r.ok))
        .catch(() => alive && setUp(false));
    check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const cls = up === null ? "wait" : up === "locked" ? "run" : up ? "ok" : "danger";
  const label = up === null ? "Connecting" : up === "locked" ? "Token needed" : up ? "Server online" : "Server offline";
  return (
    <span
      className="serverStatus"
      role={up === "locked" ? "button" : undefined}
      tabIndex={up === "locked" ? 0 : undefined}
      onClick={() => up === "locked" && window.dispatchEvent(new Event("garry:auth"))}       title={`${label}: ${apiBase}`}
      aria-label={label}
    >
      <span className={`dot ${cls}`} />
      <span className="serverLabel">{label}</span>
    </span>
  );
}
