import { GitHub } from "../github/client.js";
import { gitAuthArgs } from "../github/connect.js";
import { createRepo, proposeRepo } from "../github/create-repo.js";
import { githubToken } from "../github/env.js";
import { QA_LABEL, assessQa, parseDiff, qaMarkdown } from "../review/qa.js";
import { PushError } from "./errors.js";
import type { ThreadEvents } from "./events.js";
import { git, remoteSlug } from "./git.js";
import { pushRefusal } from "./settings.js";
import { now, type Thread, type ThreadStore } from "./store.js";

export interface PushPreview {
  branch: string;
  /** owner/name on GitHub; null when the repository is not there */
  remote: string | null;
  base: string;
  commits: { sha: string; subject: string }[];
  mode: "ask" | "allow" | "never";
  draft: boolean;
  refused: string | null;
  /** the repository Garry would create, named as in Garry, when there is none on GitHub */
  create: { owner: string; name: string } | null;
}

export interface CreateRequest {
  owner?: string;
  name?: string;
  private?: boolean;
}

export interface OpenPrRequest {
  title?: string;
  body?: string;
  confirmed?: boolean;
  create?: CreateRequest;
}

export interface PullRequestHost {
  defaultBranch(owner: string, name: string): Promise<string>;
  openPr(owner: string, name: string, head: string, base: string, title: string, body: string, draft?: boolean): Promise<{ number: number; url: string }>;
  setLabel(owner: string, name: string, issue: number, label: string, on: boolean, color?: string, description?: string): Promise<void>;
}

export interface PublisherDeps {
  token: () => string | undefined;
  host: (token: string) => PullRequestHost;
}

const defaults: PublisherDeps = { token: githubToken, host: (token) => new GitHub(token) };

const currentBranch = (path: string) => {
  try {
    return git(path, ["symbolic-ref", "--short", "HEAD"]).trim();
  } catch {
    return "";
  }
};

const commitsSince = (worktree: string, base: string) =>
  git(worktree, ["log", "--format=%h%x09%s", `${base}..HEAD`])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, ...subject] = line.split("\t");
      return { sha, subject: subject.join("\t") };
    });

/**
 * The project's settings decide whether a push may happen at all and whether a
 * person must say yes first.
 */
export class Publisher {
  constructor(
    private readonly store: ThreadStore,
    private readonly events: ThreadEvents,
    private readonly deps: PublisherDeps = defaults,
  ) {}

  async preview(t: Thread): Promise<PushPreview> {
    const settings = this.store.settings(t.projectId);
    const project = this.store.project(t.projectId)!;
    const slug = remoteSlug(project.path);
    const token = this.deps.token();
    const create = slug ? null : await proposeRepo(project, token);
    const remoteBase =
      slug && token
        ? await this.deps
            .host(token)
            .defaultBranch(slug.owner, slug.name)
            .catch(() => "")
        : "";
    const base = settings.baseBranch || remoteBase || (create ? currentBranch(project.path) : "") || "the default branch";
    return {
      branch: t.branch,
      remote: slug ? `${slug.owner}/${slug.name}` : null,
      base,
      commits: commitsSince(t.worktree, t.baseSha),
      mode: settings.push,
      draft: settings.draftPr,
      refused: pushRefusal(settings, t.branch, base) ?? (slug || create ? null : this.whyNoHome(token)),
      create,
    };
  }

  async openPr(t: Thread, req: OpenPrRequest): Promise<Thread> {
    const project = this.store.project(t.projectId)!;
    const settings = this.store.settings(t.projectId);
    if (settings.push === "never") throw new PushError(pushRefusal(settings, t.branch, "")!, 403);
    let slug = remoteSlug(project.path);
    if (!slug && !req.create) throw new Error("the project has no GitHub origin remote");
    const token = this.deps.token();
    if (!token) throw new Error("connect GitHub first (Settings, GitHub) or set GARRY_GITHUB_TOKEN in .env.local");
    if (git(t.worktree, ["status", "--porcelain"]).trim()) throw new Error("commit the changes first");

    const host = this.deps.host(token);
    const base = settings.baseBranch || (slug ? await host.defaultBranch(slug.owner, slug.name) : currentBranch(project.path));
    const refused = pushRefusal(settings, t.branch, base);
    if (refused) throw new PushError(refused, 403);
    if (settings.push === "ask" && !req.confirmed) {
      const where = slug ? `${slug.owner}/${slug.name}` : "a new GitHub repository";
      throw new PushError(`this project asks before pushing: confirm pushing ${t.branch} to ${where}`, 428);
    }
    if (!slug) {
      const made = await createRepo(project, token, req.create);
      this.events.emit(t.id, { type: "git", action: "repo", detail: made.url, at: now() });
      slug = { owner: made.owner, name: made.name };
    }

    // The token goes with this one push and is never written into the repository; never forced.
    git(t.worktree, [...gitAuthArgs(token), "push", "--set-upstream", "origin", `refs/heads/${t.branch}:refs/heads/${t.branch}`]);
    const qa = assessQa(parseDiff(git(t.worktree, ["diff", "--no-color", `${t.baseSha}...HEAD`])));
    const body = [req.body ?? `Built with Garry in thread ${t.id}.`, qaMarkdown(qa)].join("\n\n");
    t.pr = await host.openPr(slug.owner, slug.name, t.branch, base, req.title?.trim() || t.title, body, settings.draftPr);
    if (qa.needed) {
      await host.setLabel(slug.owner, slug.name, t.pr.number, QA_LABEL, true, "f97316", "Someone has to try this before it ships").catch(() => undefined);
    }
    this.store.save(t);
    this.events.emit(t.id, { type: "git", action: "pr", detail: t.pr.url, at: now() });
    return t;
  }

  private whyNoHome(token: string | undefined): string {
    return token
      ? "this repository has an origin that is not on GitHub"
      : "this repository is not on GitHub: connect GitHub (Settings) and Garry offers to create it";
  }
}
