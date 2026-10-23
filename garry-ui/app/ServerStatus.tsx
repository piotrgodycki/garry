import { useEffect, useState } from "react";
import { apiBase } from "./lib/api";

/** A quiet, always visible answer to "is the backend up?", polled every 15 seconds. */
export default function ServerStatus() {
  // null while connecting; "unpaired" when this is another device without a pairing
  const [up, setUp] = useState<boolean | "unpaired" | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch(`${apiBase}/api/features`, { cache: "no-store" })
        .then((r) => alive && setUp(r.status === 401 ? "unpaired" : r.ok))
        .catch(() => alive && setUp(false));
    check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const cls = up === null || up === "unpaired" ? "wait" : up ? "ok" : "danger";
  const label = up === null ? "Connecting" : up === "unpaired" ? "Not paired: run garry pair" : up ? "Server online" : "Server offline";
  return (
    <span className="serverStatus" title={apiBase}>
      <span className={`dot ${cls}`} />
      {label}
    </span>
  );
}
