import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { IncomingMessage } from "node:http";

/**
 * Device pairing. The machine that runs garry serve is trusted (loopback). Any
 * other device, a phone on the same Wi-Fi or another computer, has to pair once
 * with a one-time code (shown as a QR code by garry serve and garry pair) and then
 * sends the device token it got with every request.
 *
 * Only a SHA-256 hash of each device token is stored, in ~/.garry/devices.json
 * (or $GARRY_HOME). Pairing codes live in memory and expire after 10 minutes.
 */

export interface Device {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string | null;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_FAILED_PAIRS_PER_MINUTE = 20;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");

export function garryHome(): string {
  return process.env.GARRY_HOME ?? join(homedir(), ".garry");
}

export class DeviceStore {
  private codes = new Map<string, number>(); // code hash -> expiry
  private failures: number[] = [];

  constructor(private file = join(garryHome(), "devices.json")) {}

  list(): Device[] {
    if (!existsSync(this.file)) return [];
    try {
      const data = JSON.parse(readFileSync(this.file, "utf8")) as { devices?: Device[] };
      return Array.isArray(data.devices) ? data.devices : [];
    } catch {
      return [];
    }
  }

  private save(devices: Device[]): void {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ devices }, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  /** A fresh one-time pairing code. */
  createCode(): { code: string; expiresAt: string } {
    const code = token();
    const expires = Date.now() + CODE_TTL_MS;
    this.codes.set(sha256(code), expires);
    return { code, expiresAt: new Date(expires).toISOString() };
  }

  /** Trades a pairing code for a device token. The code works once. */
  pair(code: string, name: string): { device: Omit<Device, "tokenHash">; token: string } | { error: string; status: number } {
    const now = Date.now();
    this.failures = this.failures.filter((t) => now - t < 60_000);
    if (this.failures.length >= MAX_FAILED_PAIRS_PER_MINUTE) return { error: "too many attempts, try again in a minute", status: 429 };
    for (const [h, exp] of this.codes) if (exp < now) this.codes.delete(h);

    const h = sha256(code);
    if (!this.codes.has(h)) {
      this.failures.push(now);
      return { error: "invalid or expired pairing code", status: 401 };
    }
    this.codes.delete(h);

    const secret = token();
    const device: Device = {
      id: randomUUID(),
      name: name.trim().slice(0, 64) || "device",
      tokenHash: sha256(secret),
      createdAt: new Date(now).toISOString(),
      lastSeenAt: null,
    };
    this.save([...this.list(), device]);
    const { tokenHash: _, ...pub } = device;
    return { device: pub, token: secret };
  }

  /** The device a token belongs to, or null. */
  verify(secret: string): Device | null {
    const h = sha256(secret);
    const devices = this.list();
    const device = devices.find((d) => d.tokenHash === h) ?? null;
    if (device) {
      // record the last use at most once a minute, so requests do not rewrite the file
      const seen = device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0;
      if (Date.now() - seen > 60_000) {
        device.lastSeenAt = new Date().toISOString();
        this.save(devices);
      }
    }
    return device;
  }

  revoke(id: string): boolean {
    const devices = this.list();
    const rest = devices.filter((d) => d.id !== id);
    if (rest.length === devices.length) return false;
    this.save(rest);
    return true;
  }
}

/** True for requests from this machine. */
export function isLoopback(req: IncomingMessage): boolean {
  const a = req.socket.remoteAddress ?? "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

/**
 * The device token of a request: the Authorization header, or for GET only the
 * access_token query parameter (a browser EventSource cannot set headers).
 */
export function requestToken(req: IncomingMessage, url: URL): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  if (req.method === "GET") return url.searchParams.get("access_token");
  return null;
}

/** The link a device opens or scans to pair: http://<host>:<port>/pair?code=... */
export function pairingLink(host: string, port: number, code: string): string {
  const h = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${h}:${port}/pair?code=${encodeURIComponent(code)}`;
}
