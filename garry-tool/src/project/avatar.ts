import { parseSlug } from "../github/client.js";
import { remoteSlug } from "../threads/git.js";

/**
 * The GitHub owner most of a project's repositories live under, for its avatar.
 * GARRY_GITHUB_AVATARS=off keeps names off github.com requests.
 */
export function projectOwner(repoPaths: string[], pendingRemotes: string[] = []): string | null {
  if (process.env.GARRY_GITHUB_AVATARS?.trim() === "off") return null;
  const owners = [...repoPaths.map((p) => remoteSlug(p)?.owner), ...pendingRemotes.map((r) => parseSlug(r)?.owner)].filter((o): o is string => Boolean(o));
  const count = new Map<string, number>();
  for (const o of owners) count.set(o, (count.get(o) ?? 0) + 1);
  // the most repositories, then the first one met
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** The avatar of a GitHub user or organization, at a size that stays sharp in the rail. */
export const avatarUrl = (owner: string) => `https://github.com/${encodeURIComponent(owner)}.png?size=96`;
