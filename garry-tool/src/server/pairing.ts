import { networkInterfaces } from "node:os";
import pc from "picocolors";
import QRCode from "qrcode";
import { pairingLink } from "./auth.js";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export const isLoopbackHost = (host: string) => LOOPBACK.has(host);

/** IPv4 addresses other devices can reach: LAN first, then VPNs such as Tailscale (100.64.0.0/10). */
export function reachableAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) out.push(a.address);
  }
  const rank = (ip: string) => (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) ? 0 : /^100\./.test(ip) ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** The host names other devices use to reach a server bound to host. */
export function hostsFor(host: string): string[] {
  if (isLoopbackHost(host)) return [];
  return host === "0.0.0.0" || host === "::" ? reachableAddresses() : [host];
}

/** The address to put in the pairing link for a server bound to host. */
export function advertisedHost(host: string): string | null {
  if (host === "0.0.0.0" || host === "::") return reachableAddresses()[0] ?? null;
  return isLoopbackHost(host) ? null : host;
}

/** Prints the pairing link and its QR code. */
export async function printPairing(host: string, port: number, code: string, expiresAt: string): Promise<void> {
  const link = pairingLink(host, port, code);
  const qr = await QRCode.toString(link, { type: "terminal", small: true });
  console.log(pc.bold("\nPair a phone or another computer"));
  console.log(qr);
  console.log(`Scan the code with the Garry app, or paste this link into Add server:\n${pc.cyan(link)}`);
  console.log(pc.dim(`One device, one use, valid until ${new Date(expiresAt).toLocaleTimeString()}. Run "garry pair" for another.\n`));
}
