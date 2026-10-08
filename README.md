<p align="center">
  <img src="assets/garry-logo.svg" alt="Garry logo" width="324" height="88" />
</p>

<p align="center">
  <a href="https://github.com/piotrgodycki/garry/actions/workflows/ci.yml"><img src="https://github.com/piotrgodycki/garry/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-0ea5e9" alt="Node >=22" />
  <img src="https://img.shields.io/badge/TypeScript-strict-6366f1" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/design-contract%20first-0ea5e9" alt="contract first" />
  <img src="https://img.shields.io/badge/security-npm%20audit%20%2B%20Semgrep-6366f1" alt="security npm audit plus Semgrep" />
  <img src="https://img.shields.io/badge/roadmap-phase%204%2F9-111827" alt="roadmap phase 4 of 9" />
</p>

```text
   ____    _    ____  ______   __
  / ___|  / \  |  _ \|  _ \ \ / /
 | |  _  / _ \ | |_) | |_) \ V /
 | |_| |/ ___ \|  _ <|  _ < | |
  \____/_/   \_\_| \_\_| \_\|_|

  A G E N T   .   AI SDLC orchestrator
```

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

The packages are colocated here for now and will be split into separate
repositories when they are published.

## Quick start

```bash
cd garry-registry && npm ci && npm run validate
cd ../garry-skills && npm ci && npm run validate
```

Expected output: `registry OK` for the sample registry, and the skills validator
listing the planned skills as warnings (only `contract-validate` is built so far).

## Scripts

Each package exposes the same scripts:

| Script | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run validate` | runs the package validator over the sample data |
| `npm run build` | compiles to `dist/` |

## Continuous integration

CI lives in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) and runs on
every push and pull request. It has three jobs:

- `validate` (one per package): `npm ci`, `npm run typecheck`, `npm run validate`.
- `dash-guard`: runs `scripts/check-no-emdash.mjs`. The build fails if any em dash,
  en dash, figure dash or horizontal bar appears in tracked text files.
- `security`: the security review. It runs `npm audit` (fails on a high or critical
  advisory) for both packages and a Semgrep static analysis scan. The repository is
  private, so CodeQL is not used (code scanning on a private repository needs paid
  GitHub Advanced Security); Semgrep runs fully inside the job and needs no token.

### CI budget

The pipeline is kept cheap on purpose:

- Runner: `ubuntu-latest` only (Linux bills at the base 1x minute rate; macOS and
  Windows cost 10x and 2x and are avoided).
- Concurrency: `cancel-in-progress` stops superseded runs on the same ref, so a new
  push does not pay for a stale run.
- Caching: npm is cached per package lockfile, so installs stay fast.
- Node 22, a single version, so the matrix stays at two entries (one per package).
- Rough cost per run: validate about 1 to 2 minutes per package, dash guard and
  security under a minute each. A full run is a few minutes, which stays well inside
  the GitHub Actions free tier (2000 minutes per month on a private repository,
  unlimited on a public one).
- Dependabot version updates are off for now (pre MVP); `npm audit` covers dependency
  vulnerabilities, and grouped Dependabot returns when `main` and `develop` are split.

## Security

- Security review runs in CI: `npm audit` plus a Semgrep SAST scan (the repository is private, so no CodeQL).
- Dependabot version updates are off for now (removed to keep the single branch quiet
  before the MVP). `npm audit` still guards dependency vulnerabilities.
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
