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
| `garry-tool` | the `garry` CLI plus the HTTP server (REST and SSE) |
| `garry-ui` | Next.js dashboard that consumes the server |

The packages are a pnpm workspace, colocated for now and split into separate
repositories when they are published. This repo uses **pnpm only**.

## Quick start

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the whole app: the server on http://localhost:8123 and the UI
on http://localhost:3000. Open the UI and pick a feature to watch its pipeline.

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
every push and pull request. It has three jobs:

- `validate`: `pnpm install --frozen-lockfile`, then `pnpm -C <pkg> typecheck` for the
  tool packages and `pnpm -C garry-registry` validation of the mfe and backend samples
  plus `pnpm -C garry-skills validate`.
- `dash-guard`: runs `scripts/check-no-emdash.mjs`. The build fails if any em dash,
  en dash, figure dash or horizontal bar appears in tracked text files.
- `security`: the security review. It runs `pnpm audit` (fails on a high or critical
  advisory) across the workspace and a Semgrep static analysis scan. The repository is
  private, so CodeQL is not used (code scanning on a private repository needs paid
  GitHub Advanced Security); Semgrep runs fully inside the job and needs no token.

### CI budget

The pipeline is kept cheap on purpose:

- Runner: `ubuntu-latest` only (Linux bills at the base 1x minute rate; macOS and
  Windows cost 10x and 2x and are avoided).
- Concurrency: `cancel-in-progress` stops superseded runs on the same ref, so a new
  push does not pay for a stale run.
- Caching: the pnpm store is cached, so installs stay fast.
- Node 22 and pnpm 10, a single version each.
- Rough cost per run: a few minutes total, which stays well inside the GitHub Actions
  free tier (2000 minutes per month on a private repository, unlimited on a public one).
- Dependabot version updates are off for now (pre MVP); `pnpm audit` covers dependency
  vulnerabilities, and grouped Dependabot returns when `main` and `develop` are split.

## Security

- Security review runs in CI: `pnpm audit` plus a Semgrep SAST scan (the repository is private, so no CodeQL).
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

To be decided before the first public release.
