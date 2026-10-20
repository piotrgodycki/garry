// Base URL of the garry-server (phase 5). Override with NEXT_PUBLIC_GARRY_SERVER.
//
// Without an override the base is picked at runtime from the page origin:
// - opened straight from `next dev` (port 3000, for example http://localhost:3000
//   or a LAN address), the server is the same host on port 8123;
// - opened behind a reverse proxy such as `tailscale serve` (see `pnpm phone`), the
//   proxy forwards /api to the server, so the base is the page origin itself. This
//   keeps everything on one HTTPS origin, which the phone needs for the microphone.
function resolveApiBase(): string {
  const override = process.env.NEXT_PUBLIC_GARRY_SERVER;
  if (override) return override;
  if (typeof window === "undefined") return "http://localhost:8123";
  const { protocol, hostname, port, origin } = window.location;
  if (port === "3000") return `${protocol}//${hostname}:8123`;
  return origin;
}

export const apiBase = resolveApiBase();

// Access token for a server started with GARRY_ACCESS_TOKEN. It is kept in this
// browser only (localStorage) and sent with every request. A page opened with
// #garry-token=<token> in the address stores it and removes it from the URL, so a
// phone can be signed in by opening one link.
const TOKEN_KEY = "garry-access-token";

export function getToken(): string | null {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked: the token lasts until the page is closed
  }
}

/** Reads #garry-token=... from the address once, stores it and cleans the URL. */
export function adoptTokenFromUrl(): void {
  if (typeof window === "undefined") return;
  const m = /(?:^#|&)garry-token=([^&]+)/.exec(window.location.hash);
  if (!m) return;
  setToken(decodeURIComponent(m[1]));
  clearTokenFromUrl();
}

/** Removes #garry-token from the address bar. Keeps the router's history state. */
export function clearTokenFromUrl(): void {
  if (typeof window === "undefined" || !/garry-token=/.test(window.location.hash)) return;
  history.replaceState(history.state, "", window.location.pathname + window.location.search);
}

/** fetch() against the Garry server with the access token. A 401 asks for a token. */
export async function api(path: string, init: RequestInit = {}, opts: { silent?: boolean } = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (res.status === 401 && !opts.silent && typeof window !== "undefined") window.dispatchEvent(new Event("garry:auth"));
  return res;
}

/** A URL for EventSource, which cannot send headers, so the token goes in the query. */
export function apiUrl(path: string): string {
  const token = getToken();
  if (!token) return `${apiBase}${path}`;
  return `${apiBase}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
}

// Runs on import in the browser, before any page effect fetches data.
adoptTokenFromUrl();
