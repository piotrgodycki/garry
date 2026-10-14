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
