<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/garry-logo-dark.svg" />
    <img src="assets/garry-logo.svg" alt="Garry logo" width="300" height="88" />
  </picture>
</p>

<p align="center">
  <a href="https://github.com/piotrgodycki/garry/actions/workflows/ci.yml"><img src="https://github.com/piotrgodycki/garry/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-0ea5e9" alt="Node >=22" />
  <img src="https://img.shields.io/badge/TypeScript-strict-6366f1" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/design-contract%20first-0ea5e9" alt="contract first" />
  <img src="https://img.shields.io/badge/security-npm%20audit%20%2B%20Semgrep-6366f1" alt="security npm audit plus Semgrep" />
  <img src="https://img.shields.io/badge/roadmap-phase%204%2F9-111827" alt="roadmap phase 4 of 9" />
</p>

# Garry

Garry is a single supervisor agent that a human talks to. It drives each feature
through the full AI software development lifecycle and delegates every stage to
specialized subagents, one per repository, while a Contract Registry keeps the
services aware of each other. The starting point is microfrontends (React 19 with
Vite and Module Federation). The longer term target is any microservice, each with
its own repository, database and stack.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design.

## Packages

| Package | Role |
|---|---|
| `garry-registry` (`@garry/registry`) | Contract Registry: zod schemas and validation for cross service contracts |
| `garry-skills` (`@garry/skills`) | atomic, reusable agent capabilities per SDLC stage |
| `garry-tool` (`garry` on npm) | the `garry` CLI plus the HTTP server (REST and SSE) |
| `garry-ui` | Next.js dashboard that consumes the server |

The packages are a pnpm workspace. This repo uses **pnpm only**. The CLI is
published to npm as [`garry`](https://www.npmjs.com/package/garry), with the
registry and skills code bundled in: `npx garry --help`.

## Quick start

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the whole app: the server on http://localhost:8123 and the UI
on http://localhost:3000. Open the UI and pick a feature to watch its pipeline.

## Guides

- [The Garry SDLC](./docs/sdlc.md): how a feature goes from an idea to production,
  stage by stage, and what you do at each one.
- [The garry CLI](./docs/cli.md): every command with its options and examples.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | start the server and the UI together |
| `pnpm serve` | server only, on :8123 |
| `pnpm ui` | UI only, on :3000 (needs the server) |
| `pnpm scaffold` | the interactive scaffolding wizard |
| `pnpm -r typecheck` | type check every package |
| `pnpm -C garry-registry validate` | validate the sample registry |
| `pnpm -C garry-skills validate` | validate the skills manifest |

## Continuous integration

CI lives in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) and runs on
every push and pull request. It has four jobs:

- `validate`: `pnpm install --frozen-lockfile`, then `pnpm -C <pkg> typecheck` for the
  tool packages and `pnpm -C garry-registry` validation of the mfe and backend samples
  plus `pnpm -C garry-skills validate`, and the skill security audit: every
  pre-installed skill must pass it, and the audit's regression corpus must behave.
- `package`: builds the `garry` npm package, packs it, installs the tarball into an
  empty project and runs the CLI there (`pnpm -C garry-tool smoke`).
- `dash-guard`: runs `scripts/check-no-emdash.mjs`. The build fails if any em dash,
  en dash, figure dash or horizontal bar appears in tracked text files.
- `security`: the security review. It runs `pnpm audit` (fails on a high or critical
  advisory) across the workspace and a Semgrep static analysis scan, which runs fully
  inside the job and needs no token.

### Publishing to npm

[`.github/workflows/release.yml`](./.github/workflows/release.yml) publishes the
`garry` package with no manual step. It runs after CI on every push to `main`, and
publishes only when every CI job is green and `garry-tool/package.json` carries a
version that npm does not have yet. So a release is a version bump in a pull
request: once it is merged and CI passes, the job runs the package smoke test
again, publishes with provenance (npm shows which commit and workflow built it) and
creates the GitHub release `v<version>`. A version with a pre-release part, such as
`0.2.0-beta.1`, goes to the `next` tag instead of `latest`.

It can also be run by hand: Actions, Release, Run workflow, on `main`. It then
publishes the latest commit of `main`, and only when CI passed on that commit.
"Dry run" (on by default) goes through every step with `npm publish --dry-run`
and publishes nothing, which is a safe way to check the setup before the first
release.

It needs npm credentials, one of:

- the `NPM_TOKEN` repository secret: an npm granular access token with publish
  rights on `garry` (needed for the very first publish, since npm can only trust a
  workflow for a package that exists);
- npm trusted publishing: on npmjs.com add `piotrgodycki/garry`,
  `release.yml` as a trusted publisher, set the repository variable
  `NPM_TRUSTED_PUBLISHING=true` and delete the token.

Without either, the job ends with a warning and publishes nothing.

### Skills reach the team through a reviewed pull request

[`.github/workflows/skill-audit.yml`](./.github/workflows/skill-audit.yml) runs on
every pull request that adds or changes a skill, the audit code or the workflow
itself. It validates the manifest, runs the Garry skill security audit and its
regression corpus, a secret scan (gitleaks, pinned and checksum verified) and
Semgrep over the changed skill folders, then posts one comment with the results.
[`CODEOWNERS`](./.github/CODEOWNERS) names who must approve skills, and also the
audit code and `.github/`, so a pull request cannot weaken the gate it is judged
by. Such pull requests come from "Propose to team" on the Skills page or
`garry skills propose <folder>`.

To make it a hard gate, a repository admin adds two rulesets for `main` (Settings,
Rules, Rulesets). Two, because a pull request author cannot approve their own pull
request: with a single code owner, one strict ruleset would block that owner too.

1. **main: checks** (no bypass list): target the default branch; turn on
   Restrict deletions, Block force pushes, Require a pull request before merging
   (0 required approvals) and Require status checks to pass with `validate`,
   `package`, `dash guard`, `security review` and `skill audit`. Every change, including the
   owner's, goes through a pull request with green checks.
2. **main: review** (bypass list: Repository admin, for pull requests only):
   Require a pull request before merging with 1 required approval and Require
   review from Code Owners. Everyone else, people and agents, needs the code
   owner's approval; the admin can merge their own green pull request.

`skill audit` runs on every pull request and passes at once when no skill changed,
so it can be required without blocking unrelated work. Rulesets on a private
repository are only enforced on a paid plan (GitHub shows a warning on the ruleset
page until then).

`GARRY_SKILLS_POLICY=ci-only` on the server turns local installs off, so this
review is the only way a skill reaches an agent.

### AI code review on pull requests

[`.github/workflows/code-review.yml`](./.github/workflows/code-review.yml) reviews
every pull request that is ready for review, and again on every push, with the same
rules the Garry reviewer agent follows: the review skills in
[`garry-skills/skills/review/`](./garry-skills/skills/review/) (correctness, spec
match, contract compliance, security). Blocker and major findings are posted inline
on the diff; one summary comment lists every finding and is updated on each push.
The `code review` check fails when the review finds a blocker, so it can be added to
the required checks once you trust it. A human still approves the merge.

It runs [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action)
(pinned to a commit) on a Claude subscription (Pro or Max), not on API billing: run
`claude setup-token` once and store the token as the `CLAUDE_CODE_OAUTH_TOKEN`
repository secret. Without it the job passes with a notice. Reviews count toward
the subscription's usage limits. The model is the subscription's default, or the
`GARRY_REVIEW_MODEL` repository variable. Drafts and pull requests from forks are not
reviewed (forks get no secrets).

### Screenshots on pull requests

[`.github/workflows/pr-screenshots.yml`](./.github/workflows/pr-screenshots.yml) runs
when a pull request goes to code review: opened as ready, moved out of draft, or a
review requested from a person or a review agent, then again on every push while it
is in review. Drafts are skipped. It builds the base and the head, captures every
view listed in [`garry.screenshots.json`](./garry.screenshots.json) in headless
Chromium (desktop and mobile, light and dark), diffs them pixel by pixel and keeps
one comment on the pull request up to date with before, after and the diff of each
changed view. Run it by hand for any pull request from the Actions tab
(`workflow_dispatch`).

The images live on the orphan branch `garry-screenshots` (one folder per pull
request, removed when it closes), so they never enter the code history. Pull
requests from forks get the screenshots as a workflow artifact only, because their
token cannot write.

The same steps run locally:

```bash
pnpm -C garry-tool exec playwright install chromium   # once
pnpm garry shots capture --url http://localhost:3000 --out shots/head
pnpm garry shots compare --base shots/base --head shots/head --out shots/report
pnpm garry shots comment --report shots/report/report.json --images-url "file://$PWD/shots/report/{path}" --dry-run
```

### CI budget

The pipeline is kept cheap on purpose:

- Runner: `ubuntu-latest` only (Linux bills at the base 1x minute rate; macOS and
  Windows cost 10x and 2x and are avoided).
- Concurrency: `cancel-in-progress` stops superseded runs on the same ref, so a new
  push does not pay for a stale run.
- Caching: the pnpm store is cached, so installs stay fast.
- Node 22 and pnpm 10, a single version each.
- PR screenshots are the heaviest job (two production builds plus a Chromium
  install, roughly 6 to 8 minutes), so they only run for pull requests in review
  that touch the UI, the server or the sample registry.
- Rough cost per run: a few minutes total, which stays well inside the GitHub Actions
  free tier (2000 minutes per month on a private repository, unlimited on a public one).
- Dependabot version updates are off for now (pre MVP); `pnpm audit` covers dependency
  vulnerabilities, and grouped Dependabot returns when `main` and `develop` are split.

## Security

- Security review runs in CI: `pnpm audit` plus a Semgrep SAST scan.
- Dependabot version updates are off for now (removed to keep the single branch quiet
  before the MVP). `pnpm audit` still guards dependency vulnerabilities.
- Secrets are never committed. Tokens live in `.env` only.
- Before the MVP the project uses a single branch (`main`) with direct commits. Branch
  protection and a pull request only flow come later, when `main` and `develop` are
  split. CI still runs the security review on every push.
- Copilot reviews pull requests following [`.github/copilot-instructions.md`](./.github/copilot-instructions.md).

## Conventions

- English only, with plain ASCII punctuation. No em dashes. The dash guard enforces
  this in CI.
- Contract first: nothing touches code until the contract in the registry is updated
  and validated.

## License

[MIT](./LICENSE). Contributions are accepted under the same license.
