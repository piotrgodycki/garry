import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import Link from "../lib/router";
import { apiBase } from "../lib/api";
import { PageHeader } from "../ui";

/**
 * Opened from a pairing link (garry serve --host, garry pair) on another computer:
 * trades the one-time code for a session cookie, so this browser stays paired.
 */
export default function Pair() {
  const code = useSearchParams()[0].get("code") ?? "";
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!code) {
      setState({ ok: false, message: "This link has no pairing code. Run garry pair on the computer running Garry for a new one." });
      return;
    }
    const name = `Browser on ${navigator.platform || "another computer"}`;
    fetch(`${apiBase}/api/pair`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, name, session: "cookie" }),
    })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        setState(r.ok ? { ok: true, message: "This browser is paired with Garry." } : { ok: false, message: body.error ?? `Pairing failed (${r.status}).` });
        // drop the code from the address bar and history
        if (r.ok) window.history.replaceState(null, "", "/pair");
      })
      .catch(() => setState({ ok: false, message: "The Garry server cannot be reached from this device." }));
  }, [code]);

  return (
    <main className="page">
      <PageHeader eyebrow="Devices" title="Pair this browser" lede="Connects this browser to the Garry server on your computer." />
      {!state ? (
        <p className="notice">Pairing…</p>
      ) : (
        <div className={`notice ${state.ok ? "" : "danger"}`}>
          <p>{state.message}</p>
          {state.ok && (
            <p>
              <Link href="/">Open the dashboard</Link>
            </p>
          )}
        </div>
      )}
    </main>
  );
}
