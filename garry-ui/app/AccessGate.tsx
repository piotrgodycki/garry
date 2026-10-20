"use client";
import { useEffect, useRef, useState } from "react";
import { clearTokenFromUrl, setToken } from "./lib/api";

/**
 * Asks for the access token when the server answers 401. The token is stored in
 * this browser only. Any page can open it with the "garry:auth" event.
 */
export default function AccessGate() {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");

  // The router restores the original address after hydration, so clear the token
  // from it once more here; it was already stored when lib/api loaded.
  useEffect(() => {
    clearTokenFromUrl();
  }, []);

  useEffect(() => {
    const open = () => {
      const d = ref.current;
      if (d && !d.open) d.showModal();
    };
    window.addEventListener("garry:auth", open);
    return () => window.removeEventListener("garry:auth", open);
  }, []);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    setToken(t);
    window.location.reload();
  };

  return (
    <dialog ref={ref} className="accessGate" aria-labelledby="access-title">
      <form onSubmit={save} className="accessForm">
        <h2 id="access-title">Access token needed</h2>
        <p>
          This Garry server is protected. Paste the value of <code>GARRY_ACCESS_TOKEN</code> from the
          machine that runs it. It stays in this browser only.
        </p>
        <input
          id="access-token"
          className="input"
          type="password"
          autoComplete="current-password"
          placeholder="Access token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="access token"
          autoFocus
        />
        <div className="accessActions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn btnPrimary" disabled={!value.trim()}>
            Sign in
          </button>
        </div>
      </form>
    </dialog>
  );
}
