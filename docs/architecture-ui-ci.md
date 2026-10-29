# Garry: UI, GitHub, routing, CI and review

Sections 12 and 13 of [ARCHITECTURE.md](../ARCHITECTURE.md).

## 12. UI, GitHub, model and agent routing

Garry gets its own panel (`garry-ui`) that talks to `garry-tool/server`. The same core (the supervisor) serves both the CLI and the UI.

```
   garry-ui (Vite, React) --REST+SSE--> garry-tool/server --> supervisor --> subagents
        |                                   |
        |                                   +--> narrow GitHub token (repos, PRs, checks)
        +--> browser: the human steers and watches live agent streams
```

### garry-ui stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Vite plus React 19 plus React Router plus TS | a static build that `garry serve` hosts next to the API (one port, one origin), that the npm package ships and the desktop app loads; no server runtime of its own |
| Styling | a custom token generator (`design-tokens.json` to `tokens.css`, CSS variables) plus CSS Modules | lightweight, no dependency, white label by overriding CSS variables |
| Components | native first: the `dialog` element, Popover API, the `details` element, native controls plus CSS Modules | lightweight, accessible, no Radix or shadcn; a fallback only when needed (Base UI) |
| Data (REST) | TanStack Query | cache, refetch, request status against `garry-tool/server` |
| Tables | TanStack Table (headless) | the logic for tables of services and pull requests, our own styling |
| Live stream | SSE (`EventSource`) | the Pipeline panel: logs of subagents per skill, live, without WebSocket overhead |
| Pipeline graph | React Flow | nodes are services and stages, edges are the delegation order from the dependency graph |
| Raw agent output | xterm.js or a virtualized log | a view of what the agent actually does |
| Forms and config | react-hook-form plus zod from the registry schema | the routing matrix and contract editing validated by the same schema as the backend |

Key alignment: the UI reuses the zod schemas of the registry and the skills, so the same validation runs in the browser, the server and the CLI. One source of truth end to end.

White label (open source): a company overrides `tokens.css` (CSS variables) for its own branding without a fork and without recompiling components. The tokens come from `design-tokens.json`, so the theme is a part of the contract, not of the UI code.

Alternative (lighter): Vite plus a React SPA plus a separate `garry-tool/server`. Simpler and consistent with the MFE template stack, but without RSC and the API in one place.

### Panels

| Panel | Content |
|---|---|
| Dashboard | a report, not a control panel. The human drops raw ideas and watches. Three lanes: Ideas (captured, not yet features), Agents at work (features the agents build, review, test and ship on their own, with a live SDLC track) and Shipped. An idea becomes a feature only after a conversation with Garry in his field at the foot of every page (messages wait in line and run one at a time); nothing is advanced by a run button or drag |
| Pipeline | the dependency graph of a feature, a live stream of subagents (SSE), logs per skill |
| Registry | a view of catalog, contracts and features (live state) |
| Skills | the list of skills shipped with Garry, enable or disable, a view of `SKILL.md` |
| GitHub | repositories, pull requests, status checks, the branch per feature |
| Routing | the model by agent matrix per stage or skill |

### GitHub (narrow token)

Security first. A fine grained personal access token limited to the specific repositories Garry manages, with minimal permissions (`contents`, `pull_requests`). It cannot touch repositories outside the list. The token lives in `.env` and is never committed. When the project grows we can move to a GitHub App.

The Activity panel is the centerpiece: a swimlane per microservice shows the SDLC stages flowing, which service an agent is working on right now (a pulsing running state, done and waiting states), the agent and model per stage, and the skills in flight. A live SSE stream drives the states. Each lane has a native model picker that sets a per service model override (it changes the model only; the agent role stays from the stage route), posted to the server and reflected in the plan immediately. The PRs panel shows one card per service for the feature branch, ready for live GitHub data in phase 6.

### Model and agent routing (the matrix)

The heart of switching models and agents. Per SDLC stage (or per skill) you choose an agent profile plus a model. This lets you control cost (a cheap model for scaffolding, a strong one for review) and swap roles. On top of the stage matrix, a per service override lets you pick the model for a specific microservice from the Activity panel.

```jsonc
// garry.routing.json (defaults plus per feature overrides in the UI)
{
  "defaults": { "agent": "garry-dev", "model": "claude-sonnet-5-5" },
  "stages": {
    "spec":      { "agent": "garry-analyst",  "model": "claude-opus-5-5" },
    "scaffold":  { "agent": "garry-dev",      "model": "claude-haiku-5-5" },
    "review":    { "agent": "garry-reviewer", "model": "claude-opus-5-5" },
    "test":      { "agent": "garry-dev",      "model": "claude-sonnet-5-5" }
  }
}
```

- An agent profile is a system prompt plus a set of tools plus the allowed skills for a role.
- A model is a specific Claude model (Opus 4.8, Sonnet 4.6, Haiku 4.5, Fable 5), switchable from the UI at runtime.
- An override per feature or per single run is stored next to the feature state in the registry.

## 13. Continuous integration, security review and code review

The repository ships with CI, a mandatory security review and automated code review from the start. The security review is a job inside the CI workflow, not a separate pipeline.

### CI workflow (`.github/workflows/ci.yml`)

- `validate`: `pnpm install --frozen-lockfile`, then `pnpm -C <pkg> typecheck` for the packages, validation of the mfe and backend test registries (`pnpm -C garry-tool check:registry`) and of the skills (`check:skills`).
- `dash-guard`: runs `scripts/check-no-emdash.mjs`. The build fails if any em dash, en dash, figure dash or horizontal bar is found in tracked text files, which enforces the plain ASCII punctuation rule automatically.
- `security`: the security review as CI steps. It runs `pnpm audit` (fails on a high or critical advisory) across the workspace and a Semgrep static analysis scan. The repository is private, so CodeQL and dependency review are not used (both need paid GitHub Advanced Security on a private repository); Semgrep runs entirely inside the job with no token.

Dependabot version updates are off for now (removed to keep the single pre MVP branch quiet). `pnpm audit` still covers dependency vulnerabilities; grouped Dependabot returns when `main` and `develop` are split.

### Branching

Before the MVP the project uses a single branch (`main`) with direct commits, so iteration stays fast. CI runs on every push, so the security review still gates the work. After the MVP the project splits into `main` and `develop`, `main` becomes protected, and changes land through pull requests that must pass every CI job (validate, dash guard and security).

### Code review

Copilot reviews pull requests for free, following `.github/copilot-instructions.md` (English only, no em dashes, contract first, security notes). Automatic review is requested on every pull request in the repository settings.
