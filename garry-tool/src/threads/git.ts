import { execFileSync } from "node:child_process";

/** Git in a thread's worktree. Arguments are passed as an array, never through a shell. */
export function git(cwd: string, args: string[], input?: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
}

/** A new branch and worktree for a thread, from the project's current HEAD. */
export function addWorktree(repo: string, worktree: string, branch: string): string {
  const base = git(repo, ["rev-parse", "HEAD"]).trim();
  git(repo, ["worktree", "add", "-b", branch, worktree, base]);
  return base;
}

export function removeWorktree(repo: string, worktree: string, branch: string): void {
  try {
    git(repo, ["worktree", "remove", "--force", worktree]);
  } catch {
    // already gone
  }
  try {
    git(repo, ["branch", "-D", branch]);
  } catch {
    // the branch may be checked out elsewhere or already deleted
  }
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
}

export interface Diff {
  files: FileChange[];
  patch: string;
  /** changes not committed yet (the diff itself also shows committed ones) */
  uncommitted: boolean;
}

/** Everything the thread changed since its base: committed, staged, unstaged and new files. */
export function diff(worktree: string, base: string): Diff {
  // mark new files so they show up in the diff without staging their content
  git(worktree, ["add", "--intent-to-add", "--all"]);
  const args = ["-c", "core.quotepath=off", "diff", "--no-color", "--no-renames", base];
  const patch = git(worktree, args);
  const kinds: Record<string, FileChange["status"]> = { A: "added", M: "modified", D: "deleted" };
  const status = new Map(
    git(worktree, [...args, "--name-status"])
      .split("\n")
      .filter(Boolean)
      .map((l) => [l.slice(l.indexOf("\t") + 1), kinds[l[0]] ?? "modified"] as const),
  );
  const files = git(worktree, [...args, "--numstat"])
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [a, d, path] = l.split("\t");
      return { path, status: status.get(path) ?? "modified", additions: Number(a) || 0, deletions: Number(d) || 0 };
    });
  const uncommitted = git(worktree, ["status", "--porcelain"]).trim().length > 0;
  return { files, patch, uncommitted };
}

/** Commits everything in the worktree; the author is the user's git identity, or Garry's. */
export function commitAll(worktree: string, message: string): string {
  git(worktree, ["add", "--all"]);
  const identity = (key: string) => {
    try {
      return git(worktree, ["config", key]).trim();
    } catch {
      return "";
    }
  };
  const author = identity("user.name") ? [] : ["-c", "user.name=Garry", "-c", "user.email=garry@localhost"];
  git(worktree, [...author, "commit", "-m", message]);
  return git(worktree, ["rev-parse", "HEAD"]).trim();
}

export function remoteSlug(repo: string): { owner: string; name: string } | null {
  try {
    // the url as configured (get-url would apply insteadOf rewrites)
    const url = git(repo, ["config", "--get", "remote.origin.url"]).trim();
    const m = /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/.exec(url);
    return m ? { owner: m[1], name: m[2] } : null;
  } catch {
    return null;
  }
}
