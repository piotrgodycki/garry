import { git, remoteSlug } from "../threads/git.js";
import { GitHub } from "./client.js";
import { gitAuthArgs } from "./connect.js";

/**
 * A repository that has no home on GitHub yet gets one named as it is in
 * Garry, and only when a person says yes: Garry proposes owner/name, the
 * person confirms (or changes them), then Garry creates it (private unless
 * they say otherwise), adds it as origin and pushes the current branch, so a
 * pull request has a base to go into.
 */

export class CreateRepoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** The GitHub name for a repository named in Garry: what GitHub allows, the rest as dashes. */
export function githubName(name: string): string {
  const s = name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|-+$/g, "")
    .slice(0, 100);
  return s && s !== "." && s !== ".." ? s : "repo";
}

/** Whether the repository has an origin at all (on GitHub or elsewhere). */
const hasOrigin = (path: string) => {
  try {
    return git(path, ["config", "--get", "remote.origin.url"]).trim() !== "";
  } catch {
    return false;
  }
};

/** What Garry would create for a repository with no remote: null when it has one, or no token says who you are. */
export async function proposeRepo(project: { path: string; name: string }, token: string | null | undefined): Promise<{ owner: string; name: string } | null> {
  if (!token || hasOrigin(project.path)) return null;
  const login = await new GitHub(token).login().catch(() => null);
  return login ? { owner: login, name: githubName(project.name) } : null;
}

export async function createRepo(project: { path: string; name: string }, token: string | null | undefined, opts: { owner?: string; name?: string; private?: boolean; description?: string } = {}): Promise<{ owner: string; name: string; url: string; pushed: string | null }> {
  if (!token) throw new CreateRepoError("connect GitHub first (Settings, GitHub)", 400);
  if (remoteSlug(project.path)) throw new CreateRepoError("this repository is already on GitHub", 409);
  if (hasOrigin(project.path)) throw new CreateRepoError("this repository already has an origin remote that is not on GitHub; Garry leaves it as it is", 409);
  const name = opts.name?.trim() || githubName(project.name);
  if (!NAME.test(name) || name === "." || name === "..") throw new CreateRepoError("name: letters, digits, dot, dash and underscore, up to 100", 400);
  const gh = new GitHub(token);
  const login = await gh.login();
  const owner = opts.owner?.trim() || login;
  if (!OWNER.test(owner)) throw new CreateRepoError("owner: a GitHub user or organization name", 400);
  let made: { owner: string; name: string; url: string };
  try {
    made = await gh.createRepo(owner === login ? null : owner, name, opts.private !== false, opts.description ?? "");
  } catch (e) {
    const msg = String((e as Error).message);
    if (/\b422\b/.test(msg)) throw new CreateRepoError(`${owner}/${name} already exists on GitHub: pick another name`, 409);
    if (/\b40[34]\b/.test(msg)) throw new CreateRepoError(`GitHub would not create ${owner}/${name}: the token may not create repositories${owner === login ? "" : ` in ${owner}`}`, 403);
    throw e;
  }
  // no credentials in the remote url: the token goes with each push only
  git(project.path, ["remote", "add", "origin", `https://github.com/${made.owner}/${made.name}.git`]);
  let pushed: string | null = null;
  try {
    const branch = git(project.path, ["symbolic-ref", "--short", "HEAD"]).trim();
    git(project.path, ["rev-parse", "--verify", "HEAD"]);
    git(project.path, [...gitAuthArgs(token), "push", "--set-upstream", "origin", `refs/heads/${branch}:refs/heads/${branch}`]);
    pushed = branch;
  } catch {
    // an empty repository or a detached head: the remote is there, nothing to push yet
  }
  return { ...made, pushed };
}
