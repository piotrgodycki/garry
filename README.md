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
| `garry-tool` (`garry` on npm, the only published package) | the `garry` CLI plus the HTTP server (REST and SSE); also the registry schemas and validation (`src/registry/schema`), the pre-installed skills (`skills/`) and the test registries (`testdata/registry`) |
| `garry-ui` | the dashboard (Vite and React), served by `garry serve` |
| `garry-desktop` | the desktop app for macOS (Electron, with `garry serve` built in) |
| `garry-mobile` | the app for iOS (Expo, React Native) |
| `garry-client` | typed client for the server (REST, live stream, pairing), used by the mobile app |

The packages are a pnpm workspace. This repo uses **pnpm only**. The CLI is
published to npm as [`garry`](https://www.npmjs.com/package/garry), with the
registry and skills code bundled in: `npx garry --help`.

## Quick start

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the whole app for development: the server on
http://localhost:8123 and the UI with hot reload on http://localhost:3000.

Garry starts empty: there is no sample data. Add your services in the dashboard
(Registry, Add service) or with `garry service add`, optionally on a tech stack
you compose first (Stacks, or `garry stack add`), and lay out how they fit together
with the platforms they run on (Architecture); they go to `./registry` when
it has a `catalog/`, else to `~/.garry/registry`. Then create a feature (New
feature on the dashboard or the phone, or Make it a feature on a captured idea,
or `garry feature new`) and watch its pipeline.

Without development tools, `pnpm -C garry-ui build` once and `pnpm serve`: the
server hosts the dashboard and the API together on http://localhost:8123 (the npm
package ships the dashboard built, so `npx garry serve` does the same).

Configuration is optional: copy [`.env.example`](./.env.example) to `.env.local`
and fill in what you need. GitHub needs no file at all: paste a token in Settings
(GitHub) or with `garry github login`, or sign in with the GitHub CLI.

## Projects

Everything one product is made of (services, contracts, features, stacks,
routing, the architecture board, and the repositories agents work on) lives in
a Garry project. Switch projects at the top of the sidebar; export one to a
single `.garry.json` file and import it on another computer (Settings,
Projects, or `garry project export` / `import`). See [docs/cli.md](./docs/cli.md#garry-project).

## Build with agents (the IDE)

Garry is where you work on code with agents. Open **Build** in the dashboard, the
desktop app or the phone app, pick a project, say what should change, and an agent
works on it:

- every piece of work gets its own branch and git worktree
  (`garry/<what>-<id>`), so your own checkout is never touched;
- you follow the agent live: what it reads, edits and runs, and its answers; you
  reply to steer it, or stop it;
- the diff shows everything it changed; **Commit**, then **Open pull request**
  (CI, the AI review and screenshots take it from there, and when the change
  needs a person to try it, the pull request gets the **needs human QA** label and
  a checklist of what to check). Garry asks before every push, showing the
  branch, the remote and the commits; each project can change that (ask, allow,
  never), its base branch, branch prefix and protected branches (Push and branch
  settings), and agents themselves can never push;
- **Files** browses the worktree and lets you change any file by hand in a code
  editor (Cmd/Ctrl+S saves); your edits land in the same diff. It is read only
  while the agent works, and a file the agent changed since you opened it is
  not overwritten. Files open on this computer only, never on a paired phone;
- the Build page also shows the selected project's own checkout (the Garry
  repository itself when `garry serve` runs in it), and the Registry page the
  registry's files (catalog, contracts, features, stacks), with the same editor.

The agent is [Claude Code](https://docs.claude.com/en/docs/claude-code) on your
own Claude plan, run on the computer that runs Garry: install it and sign in once
(`claude`). No API key is needed. It may read, edit and write files in the
worktree and run read-only git commands; anything else it asks for is refused for
now (approving commands is the next step).

Projects are git repositories on that computer: `garry serve` adds the one it
starts in, the desktop app adds the folder you open, and `garry repos add
<path>` adds others. Your phone can start and steer work once it is paired, but
only this computer can add folders, open and edit files, or discard work.

## Platforms

The apps ship for **macOS** and **iOS** for now, where Touch ID and Face ID guard
them. The `garry` CLI and the dashboard in the browser run on macOS, Windows and
Linux, and the iPhone app pairs with a Garry server on any of them. Windows,
Linux and Android apps (and biometrics there):
[#19](https://github.com/piotrgodycki/garry/issues/19).

## Desktop app

`garry-desktop` is Garry as an app for macOS: the dashboard in
its own window with the server built in, so there is nothing else to install or
start. File, Open Project picks the folder with your registry; Devices, Allow Phones
and Other Computers, then Pair a Device, shows the pairing QR code.

- Installers: every release attaches them to its
  [GitHub release](https://github.com/piotrgodycki/garry/releases): `.dmg` for macOS
  (Apple silicon and Intel).
  Actions, Desktop, Run workflow builds them for any commit as a workflow artifact.
- **Touch ID** (Macs with Touch ID): the app opens locked, locks again when the
  screen locks, the Mac sleeps or after ten idle minutes (or Devices, Lock Garry),
  and asks for Touch ID before it starts new work, commits or opens a pull request.
  Devices, Require Touch ID turns it off (with Touch ID).
- From source: `pnpm desktop` builds the app and starts it (Electron is downloaded
  on the first run).
- The installers are not code signed yet. macOS then says the app "cannot be
  opened": right click it, Open, or run `xattr -cr /Applications/Garry.app`.
  Signing starts as soon as
  the `CSC_LINK` and `CSC_KEY_PASSWORD` secrets (and for macOS notarization
  `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) are set.

## Mobile app

`garry-mobile` is Garry on your phone: the features and the stage each is at, the
agents working live, and the pull requests. New feature creates one (what it is,
the goal, the services and contracts it touches), New work starts an agent in a
project. It talks to the server on your
computer over your Wi-Fi (or Tailscale), after pairing once with a QR code.

1. On the computer: `pnpm serve --host 0.0.0.0` (or `garry serve --host 0.0.0.0`),
   or in the desktop app Devices, Allow Phones and Other Computers. A pairing QR
   code is shown; `garry pair` shows a new one.
2. Run the app: install **Expo Go** from the App Store, then `pnpm mobile` on the
   computer and scan the QR code it prints with the camera. The phone must be on
   the same network.
3. In the app, scan Garry's pairing QR code. The phone gets its own key, kept in
   the iOS keychain; `garry devices revoke <id>` cuts it off.

**Face ID on iOS:** the app opens locked and locks again a minute after it goes to
the background; the key to your computer sits in the keychain behind Face ID, so
even an unlocked phone does not give it away; new work, commits and pull requests
ask for Face ID first; the app switcher shows a cover instead of your code.
Settings, Require Face ID turns it off. Expo Go cannot use Face ID (it falls back
to the passcode); a development build (`npx expo run:ios` on a Mac with Xcode, or
`eas build --profile development`) has the real thing.

TestFlight and App Store builds come from Expo's build service:
`eas build --platform ios --profile production`, then `eas submit --platform ios`
([`eas.json`](./garry-mobile/eas.json)). That needs an Expo account and an Apple
Developer account (99 USD a year, the same one that signs the Mac app). Until then
Expo Go runs the app. CI checks the app on every push: the
client against a real server, a typecheck and a full bundle.

## Guides

- [The Garry SDLC](./docs/sdlc.md): how a feature goes from an idea to production,
  stage by stage, and what you do at each one.
- [The garry CLI](./docs/cli.md): every command with its options and examples.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | start the server and the UI together |
| `pnpm serve` | server only, on :8123 |
| `pnpm ui` | UI only with hot reload, on :3000 (needs the server) |
| `pnpm desktop` | build and start the desktop app |
| `pnpm mobile` | start the mobile app for Expo Go (scan the QR code with your phone) |
| `pnpm garry repos` | the repositories of the active project (`add <path>` adds one) |
| `pnpm scaffold` | the interactive scaffolding wizard |
| `pnpm -r typecheck` | type check every package |
| `pnpm -C garry-tool check:registry <dir>` | validate a registry (for example `testdata/registry/frontend`) |
| `pnpm -C garry-tool check:skills` | validate the skills manifest |

## Continuous integration

CI lives in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) and runs on
every push and pull request. It has four jobs:

- `validate`: `pnpm install --frozen-lockfile`, then `pnpm -C <pkg> typecheck` for the
  tool packages, validation of the mfe and backend test registries
  (`check:registry`) and of the skills (`check:skills`), and the skill security audit: every
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
creates the GitHub release `v<version>` with the macOS installers attached (built by [`desktop.yml`](./.github/workflows/desktop.yml)). A version with a pre-release part, such as
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
[`garry-tool/skills/skills/review/`](./garry-tool/skills/skills/review/) (correctness, spec
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
pnpm garry shots capture --url http://localhost:8123 --out shots/head
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
  that touch the UI, the server or the test registry.
- Rough cost per run: a few minutes total, which stays well inside the GitHub Actions
  free tier (2000 minutes per month on a private repository, unlimited on a public one).
- Dependabot version updates are off for now (pre MVP); `pnpm audit` covers dependency
  vulnerabilities, and grouped Dependabot returns when `main` and `develop` are split.

## Security

- Security review runs in CI: `pnpm audit` plus a Semgrep SAST scan.
- Dependabot version updates are off for now (removed to keep the single branch quiet
  before the MVP). `pnpm audit` still guards dependency vulnerabilities.
- Secrets are never committed. Tokens live in `.env.local` only (see `.env.example`).
- `pnpm audit` ignores exactly two advisories, both in Expo's development CLI
  (`@expo/cli`), which runs on a developer's machine and is never part of the app,
  the server or the npm package: GHSA-86w9-cpqp-85rv (node-forge, no fixed version,
  used only to read iOS signing certificates for `expo run:ios`) and
  GHSA-mrhx-c7xc-m3w5 (zod 3, used to validate Expo dev tools plugins; Garry's own
  packages use the fixed zod 4). The list is `pnpm.auditConfig` in `package.json`;
  drop an entry as soon as Expo ships a fixed version.
- `garry serve` listens on `127.0.0.1` only. Phones and other computers connect after
  pairing with a one-time QR code and send a per-device token; see
  [Phones and other computers](./docs/cli.md#phones-and-other-computers).
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
