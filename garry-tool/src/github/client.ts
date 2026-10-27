export interface PrState {
  number: number;
  state: string;
  draft: boolean;
  url: string;
  checks: "passing" | "failing" | "pending" | "none";
}

/** Parses owner and repo from a git url or an owner/repo slug. */
export function parseSlug(repo: string): { owner: string; name: string } | null {
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(repo);
  if (ssh) return { owner: ssh[1], name: ssh[2] };
  const https = /github\.com\/([^/]+)\/(.+?)(?:\.git)?$/.exec(repo);
  if (https) return { owner: https[1], name: https[2] };
  const slug = /^([^/]+)\/([^/]+)$/.exec(repo);
  if (slug) return { owner: slug[1], name: slug[2] };
  return null;
}

/** Minimal GitHub REST client over fetch, scoped to what Garry needs. */
export class GitHub {
  /** GARRY_GITHUB_API points at GitHub Enterprise (or a test double) instead of github.com. */
  private base = (process.env.GARRY_GITHUB_API?.trim() || "https://api.github.com").replace(/\/$/, "");

  constructor(private token: string) {}

  private async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  /** The default branch of a repo, used as the base for pull requests. */
  async defaultBranch(owner: string, name: string): Promise<string> {
    const repo = await this.api<{ default_branch: string }>("GET", `/repos/${owner}/${name}`);
    return repo.default_branch;
  }

  /** Opens a pull request, or returns the existing one for the same head branch. */
  async ensurePr(owner: string, name: string, head: string, base: string, title: string, body: string): Promise<PrState> {
    const existing = await this.api<GhPr[]>("GET", `/repos/${owner}/${name}/pulls?head=${owner}:${head}&state=open`);
    const pr = existing[0] ?? (await this.api<GhPr>("POST", `/repos/${owner}/${name}/pulls`, { title, head, base, body, draft: true }));
    return { number: pr.number, state: pr.state, draft: pr.draft, url: pr.html_url, checks: await this.checks(owner, name, pr.head.sha) };
  }

  /** Lists the open pull request for a head branch, if any. */
  async prForBranch(owner: string, name: string, head: string): Promise<PrState | null> {
    const prs = await this.api<GhPr[]>("GET", `/repos/${owner}/${name}/pulls?head=${owner}:${head}&state=all`);
    const pr = prs[0];
    if (!pr) return null;
    return { number: pr.number, state: pr.state, draft: pr.draft, url: pr.html_url, checks: await this.checks(owner, name, pr.head.sha) };
  }

  /**
   * Creates or updates the one comment that carries a marker, so a bot that
   * reports on every push edits its comment instead of piling up new ones.
   */
  async upsertComment(owner: string, name: string, issue: number, marker: string, body: string): Promise<{ url: string; created: boolean }> {
    for (let page = 1; page <= 10; page++) {
      const comments = await this.api<{ id: number; body?: string; html_url: string }[]>(
        "GET",
        `/repos/${owner}/${name}/issues/${issue}/comments?per_page=100&page=${page}`,
      );
      const mine = comments.find((c) => c.body?.includes(marker));
      if (mine) {
        const c = await this.api<{ html_url: string }>("PATCH", `/repos/${owner}/${name}/issues/comments/${mine.id}`, { body });
        return { url: c.html_url, created: false };
      }
      if (comments.length < 100) break;
    }
    const c = await this.api<{ html_url: string }>("POST", `/repos/${owner}/${name}/issues/${issue}/comments`, { body });
    return { url: c.html_url, created: true };
  }

  /** A text file on a branch, or null when it does not exist. */
  async fileText(owner: string, name: string, path: string, ref: string): Promise<string | null> {
    try {
      const f = await this.api<{ content: string; encoding: string }>(
        "GET",
        `/repos/${owner}/${name}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
      );
      return Buffer.from(f.content, f.encoding === "base64" ? "base64" : "utf8").toString("utf8");
    } catch (e) {
      if (/ 404 /.test((e as Error).message)) return null;
      throw e;
    }
  }

  /**
   * Commits a set of files onto a new branch cut from base, in one commit, through
   * the Git Data API (no local clone needed). Fails if the branch already exists.
   */
  async commitToNewBranch(
    owner: string,
    name: string,
    base: string,
    branch: string,
    message: string,
    files: { path: string; content: Buffer }[],
  ): Promise<string> {
    const ref = await this.api<{ object: { sha: string } }>("GET", `/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(base)}`);
    const parent = await this.api<{ tree: { sha: string } }>("GET", `/repos/${owner}/${name}/git/commits/${ref.object.sha}`);
    const tree = [];
    for (const f of files) {
      const blob = await this.api<{ sha: string }>("POST", `/repos/${owner}/${name}/git/blobs`, {
        content: f.content.toString("base64"),
        encoding: "base64",
      });
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const newTree = await this.api<{ sha: string }>("POST", `/repos/${owner}/${name}/git/trees`, { base_tree: parent.tree.sha, tree });
    const commit = await this.api<{ sha: string }>("POST", `/repos/${owner}/${name}/git/commits`, {
      message,
      tree: newTree.sha,
      parents: [ref.object.sha],
    });
    await this.api("POST", `/repos/${owner}/${name}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
    return commit.sha;
  }

  /** Adds or removes a label on an issue or pull request, creating the label once. */
  async setLabel(owner: string, name: string, issue: number, label: string, on: boolean, color = "f97316", description = ""): Promise<void> {
    if (on) {
      await this.api("POST", `/repos/${owner}/${name}/labels`, { name: label, color, description }).catch(() => undefined); // exists already
      await this.api("POST", `/repos/${owner}/${name}/issues/${issue}/labels`, { labels: [label] });
    } else {
      await this.api("DELETE", `/repos/${owner}/${name}/issues/${issue}/labels/${encodeURIComponent(label)}`).catch(() => undefined); // was not there
    }
  }

  /** Opens a pull request ready for review (not a draft), so review workflows run at once. */
  async openPr(owner: string, name: string, head: string, base: string, title: string, body: string): Promise<{ number: number; url: string }> {
    const pr = await this.api<GhPr>("POST", `/repos/${owner}/${name}/pulls`, { title, head, base, body, draft: false });
    return { number: pr.number, url: pr.html_url };
  }

  /** Rolls up the check runs for a commit into one status. */
  private async checks(owner: string, name: string, sha: string): Promise<PrState["checks"]> {
    const runs = await this.api<{ check_runs: { conclusion: string | null }[] }>(
      "GET",
      `/repos/${owner}/${name}/commits/${sha}/check-runs`,
    );
    if (runs.check_runs.length === 0) return "none";
    if (runs.check_runs.some((r) => r.conclusion === "failure")) return "failing";
    if (runs.check_runs.some((r) => r.conclusion === null)) return "pending";
    return "passing";
  }
}

interface GhPr {
  number: number;
  state: string;
  draft: boolean;
  html_url: string;
  head: { sha: string };
}
