import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { garryHome } from "../server/auth.js";

/**
 * Connecting Garry to GitHub without editing files. The token comes from, in
 * order: GARRY_GITHUB_TOKEN (.env.local), the token saved when you connected in
 * Garry (~/.garry/github.json, readable by you only), or the GitHub CLI's own
 * sign in (gh auth token). Connecting is either pasting a token or, when
 * GARRY_GITHUB_CLIENT_ID names a GitHub OAuth app, the device flow: Garry shows
 * a code, you enter it on github.com, done.
 */

const file = () => join(garryHome(), "github.json");
const web = () => (process.env.GARRY_GITHUB_WEB?.trim() || "https://github.com").replace(/\/$/, "");
const api = () => (process.env.GARRY_GITHUB_API?.trim() || "https://api.github.com").replace(/\/$/, "");

export type TokenSource = "env" | "garry" | "gh";

export function storedToken(): string | undefined {
  try {
    const t = (JSON.parse(readFileSync(file(), "utf8")) as { token?: string }).token;
    return t?.trim() || undefined;
  } catch {
    return undefined;
  }
}

let ghCache: string | null | undefined;
/** The GitHub CLI's token when gh is installed and signed in. GARRY_NO_GH=1 skips it. */
export function ghToken(): string | undefined {
  if (process.env.GARRY_NO_GH === "1") return undefined;
  if (ghCache === undefined) {
    try {
      ghCache = execFileSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
    } catch {
      ghCache = null;
    }
  }
  return ghCache ?? undefined;
}

export function tokenWithSource(): { token: string; source: TokenSource } | undefined {
  const env = process.env.GARRY_GITHUB_TOKEN?.trim();
  if (env) return { token: env, source: "env" };
  const saved = storedToken();
  if (saved) return { token: saved, source: "garry" };
  const gh = ghToken();
  return gh ? { token: gh, source: "gh" } : undefined;
}

async function whoami(token: string): Promise<string> {
  const res = await fetch(`${api()}/user`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(res.status === 401 ? "GitHub did not accept this token" : `GitHub answered ${res.status}`);
  return ((await res.json()) as { login: string }).login;
}

/** Checks the token with GitHub and saves it for Garry (owner only). */
export async function saveToken(token: string): Promise<{ login: string }> {
  const t = token.trim();
  if (!/^[A-Za-z0-9_]{20,255}$/.test(t)) throw new Error("that does not look like a GitHub token");
  const login = await whoami(t);
  mkdirSync(dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify({ token: t, login, savedAt: new Date().toISOString() }, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file(), 0o600);
  return { login };
}

export function forgetToken(): void {
  rmSync(file(), { force: true });
}

export async function githubStatus(): Promise<{ connected: boolean; source?: TokenSource; login?: string; deviceFlow: boolean; error?: string }> {
  const deviceFlow = Boolean(process.env.GARRY_GITHUB_CLIENT_ID?.trim());
  const t = tokenWithSource();
  if (!t) return { connected: false, deviceFlow };
  try {
    return { connected: true, source: t.source, login: await whoami(t.token), deviceFlow };
  } catch (e) {
    return { connected: false, source: t.source, deviceFlow, error: String((e as Error).message) };
  }
}

/** Starts the device flow: the code to show and where to enter it. */
export async function startDeviceFlow(): Promise<{ deviceCode: string; userCode: string; verificationUri: string; interval: number; expiresIn: number }> {
  const clientId = process.env.GARRY_GITHUB_CLIENT_ID?.trim();
  if (!clientId) throw new Error("set GARRY_GITHUB_CLIENT_ID (a GitHub OAuth app) to sign in with a code; or paste a token");
  const res = await fetch(`${web()}/login/device/code`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: "repo read:user" }),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const j = (await res.json()) as { device_code: string; user_code: string; verification_uri: string; interval: number; expires_in: number };
  return { deviceCode: j.device_code, userCode: j.user_code, verificationUri: j.verification_uri, interval: j.interval ?? 5, expiresIn: j.expires_in ?? 900 };
}

/** Asks once whether the code was entered; saves the token when it was. */
export async function pollDeviceFlow(deviceCode: string): Promise<{ status: "pending" | "slow_down" | "done" | "expired" | "denied"; login?: string }> {
  const clientId = process.env.GARRY_GITHUB_CLIENT_ID?.trim();
  if (!clientId) throw new Error("GARRY_GITHUB_CLIENT_ID is not set");
  const res = await fetch(`${web()}/login/oauth/access_token`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, device_code: deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }),
  });
  const j = (await res.json()) as { access_token?: string; error?: string };
  if (j.access_token) return { status: "done", login: (await saveToken(j.access_token)).login };
  if (j.error === "authorization_pending") return { status: "pending" };
  if (j.error === "slow_down") return { status: "slow_down" };
  if (j.error === "access_denied") return { status: "denied" };
  return { status: "expired" };
}

export interface RepoSummary {
  fullName: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  cloneUrl: string;
}

/** The repositories the signed in account can reach, most recently updated first. */
export async function listRepos(token: string, query = ""): Promise<RepoSummary[]> {
  const res = await fetch(`${api()}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const q = query.trim().toLowerCase();
  return ((await res.json()) as { full_name: string; description: string | null; private: boolean; default_branch: string; updated_at: string; clone_url: string }[])
    .filter((r) => !q || r.full_name.toLowerCase().includes(q))
    .map((r) => ({ fullName: r.full_name, description: r.description, private: r.private, defaultBranch: r.default_branch, updatedAt: r.updated_at, cloneUrl: r.clone_url }));
}

/** git -c options that authenticate HTTPS to GitHub for one command, without writing the token anywhere. */
export function gitAuthArgs(token: string): string[] {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return ["-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`];
}

/** Clones owner/name into ~/.garry/repos/owner/name (or reuses it) and returns the folder. */
export function cloneRepo(token: string, fullName: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) throw new Error("repo: owner/name");
  const dir = join(garryHome(), "repos", ...fullName.split("/"));
  if (existsSync(join(dir, ".git"))) return dir;
  mkdirSync(dirname(dir), { recursive: true });
  const base = web() === "https://github.com" ? "https://github.com" : web();
  execFileSync("git", [...gitAuthArgs(token), "clone", "--quiet", `${base}/${fullName}.git`, dir], { stdio: ["ignore", "ignore", "pipe"], timeout: 10 * 60_000 });
  return dir;
}
