# Garry

Garry is a single supervisor agent that a human talks to. Garry does not write features by itself. It drives each feature through the full AI software development lifecycle (SDLC) and delegates every stage to specialized subagents. Each subagent works inside one repository, in isolation, while staying aware of the contracts exposed by the other services.

The starting point is microfrontends (React 19 with Vite and Module Federation). The longer term target is any kind of microservice, where each service owns its repository, its database and its technology stack.

## 1. Problems Garry solves

| Problem | Solution |
|---|---|
| How to give an agent context about other services without access to their repositories? | Contract Registry, one source of truth. Garry injects only the slice that is relevant to a given service. |
| Where to keep the specification? | A separate, versioned repository published as the npm package `@garry/registry`, never inside a service repository. |
| How to build features that span several services? | Contract first plus orchestration. A change to a contract drives a dependency graph, which drives delegation to agents in the right order. |
| How to avoid losing context between lifecycle stages? | The state of a feature lives in the registry (`features/FEAT-x.md` as a living document), not in the memory of a single subagent. |

## 2. High level architecture

```
          HUMAN
            |  "build feature X"
            v
     +--------------+     reads / writes
     |    GARRY     |<------------------>  @garry/registry
     |  supervisor  |                      (npm, versioned)
     +------+-------+
            | delegates: task + injected .garry/ + feature state
     +------+------+-----------+
     v      v      v           v
  shell  checkout  search    ...     subagent per repository (Claude Code)
 (host)  (remote)  (remote)
```

The human talks to Garry only. Garry holds the state and the contracts. Subagents receive only their own slice. Each subagent works in a single repository and never sees the implementation of the others, only their contracts.

## 3. Contract Registry

A separate repository published as `@garry/registry`. It is the only place where an agent learns about the world outside its own repository.

```
garry-registry/            (the @garry/registry package)
  catalog/                 service manifest per service
    shell.yaml
    checkout-mfe.yaml
    search-mfe.yaml
  contracts/
    remotes.json           Module Federation: which service exposes what
    shared-deps.json       enforced versions of shared dependencies
    design-tokens.json
    events.json            the event bus contract between microfrontends
  features/                living state documents for cross service features
    FEAT-123-new-checkout.md
  adr/                     architectural decision records
```

### Service manifest (`catalog/checkout-mfe.yaml`)

```yaml
name: checkout-mfe
repo: git@github.com:example/checkout-mfe.git
stack: react19 + vite + module-federation
owner: team-payments
exposes: [./Checkout, ./CartSummary]
consumes:
  search-mfe: [./ProductCard]
  shell: [./AuthContext]
db: null            # a microfrontend has no database; a backend service puts its connection and schema here
```

An agent in `checkout-mfe` has no access to other repositories (isolation). It reads only the registry, so it sees contracts, not implementations. The package version equals the contract version, which makes drift easy to detect.

## 4. The AI SDLC pipeline, broken into skills

Garry drives each feature through its lifecycle. A stage is not a monolith. It is a composition of atomic skills from the `@garry/skills` repository. Garry selects and composes the skills and holds the state between stages.

| # | Stage | Atomic skills (from `@garry/skills`) | Source of truth |
|---|---|---|---|
| 1 | Spec | `spec-draft`, `spec-decompose`, `acceptance-criteria` | registry |
| 2 | Plan | `impact-analysis`, `dependency-graph`, `work-breakdown` | registry |
| 3 | Design | `contract-update`, `contract-validate`, `version-bump`, `design-tokens-sync` | `@garry/registry` |
| 4 | Implement | `scaffold-mfe-shell`, `scaffold-mfe-remote`, `sync-contracts`, `generate-types`, `mf-wiring` | service repo |
| 5 | Review | `review-correctness`, `review-spec-match`, `review-contract-compliance`, `review-security` | pull request |
| 6 | Test | `test-unit`, `test-e2e`, `drift-check` | repo plus registry |
| 7 | Integrate | `cross-repo-merge`, `version-tag`, `changelog` | registry plus repo |

Guiding rule: nobody touches code until the contract in the registry is updated and validated (contract first).

Why so granular: one skill means one responsibility, so it can be tested, versioned, swapped and reused across projects independently. Garry composes skills like building blocks for a given feature, and a subagent receives only the skills it actually needs for its task.

## 5. The skills repository `@garry/skills`

A separate repository published as an npm package. It holds the reusable capabilities of the agents (the HOW), independent of the contracts of any specific project (the WHAT, which lives in the registry).

```
garry-skills/             (the @garry/skills package)
  skills/
    spec/      spec-draft, spec-decompose, acceptance-criteria
    plan/      impact-analysis, dependency-graph, work-breakdown
    design/    contract-update, contract-validate, version-bump, design-tokens-sync
    implement/ scaffold-mfe-shell, scaffold-mfe-remote, sync-contracts, generate-types, mf-wiring
    review/    review-correctness, review-spec-match, review-contract-compliance, review-security
    test/      test-unit, test-e2e, drift-check
    integrate/ cross-repo-merge, version-tag, changelog
  manifest.json           index of skills: name, stage, inputs, outputs, dependencies
```

Each skill is atomic (one responsibility), has a `SKILL.md` (instructions for the subagent) plus optional scripts, and declares in `manifest.json` its SDLC stage, what it needs as input, what it produces, and which skills it depends on. Garry reads `manifest.json` to compose a pipeline for a given feature and to inject only the needed skills into a subagent.

## 6. Garry commands and the interactive wizard

| Command | Description |
|---|---|
| `garry scaffold <service>` | composes the `scaffold-*` skills plus `sync-contracts` and registers the service in `catalog/` |
| `garry sync` | runs `sync-contracts` and `generate-types` into `.garry/` inside the repository, plus `AGENTS.md` |
| `garry feature <FEAT-id>` | composes the full SDLC pipeline from skills and delegates per repository following the graph |
| `garry doctor` | runs the `drift-check` skill: the installed contract version against the latest in the registry |
| `garry skills` | lists and validates the available skills from `@garry/skills` |

Delegation (Implement, Review, Test) uses a `delegate(repo, task, skills[])` tool that spawns a Claude Code subagent in the given repository with the injected set of skills.

### Interactive wizard (clack and ANSI)

`garry` is first of all an interactive wizard, not just a set of flags. Every command (`scaffold`, `feature`, `adopt`) has a wizard mode that guides the user step by step:

- ANSI art on every screen: a banner and logo on start and in the header of each step (figlet plus gradient).
- A stepper that shows progress through the wizard.
- Dynamic loaders and spinners for long operations (clone, scaffold, validation, agent delegation) with live status.
- A theme taken from the design tokens, consistent with the design system. White label: the wizard logo and palette come from config, so a company can rebrand without a fork.

Stack (lightweight, audited before install): the interaction engine is `@clack/prompts` (built in spinners), the banner uses `figlet` and `gradient-string`, colors use `picocolors`.

## 7. Cross service feature flow

```
1. Spec -> registry/features/FEAT-123.md
2. garry feature FEAT-123
   - PLAN: touches shell, checkout-mfe and search-mfe
   - DESIGN: changes the events.json contract, bumps @garry/registry
   - graph:  [events.json] -> [checkout agent] -> [shell agent]
                            -> [search agent]
   - IMPLEMENT: delegates agents following the graph (the one that changes the contract first)
   - REVIEW: a reviewer per pull request
   - TEST: garry doctor plus tests per repo
   - INTEGRATE: a consistent merge of all pull requests, then a version tag
3. The whole state is tracked in FEAT-123.md the entire time
```

## 8. Workspace (multicheckout)

A workspace is the materialization of a feature on disk: a set of services plus a shared branch, handled as one unit. The list of services comes from `features/FEAT-x.md`. It is the physical base on which the supervisor delegates subagents, each in its own directory, on the shared branch.

- Branch: the convention `feat/<FEAT-id>`, enforced across all repositories (consistent by definition, auto linked to the feature, easy to drift check).
- Mechanism: git worktree. Garry keeps a main clone per repository in a cache and creates a worktree per feature. The team's main checkout stays untouched.

```
~/.garry/cache/<repo>.git            main clone (mirror), fetched once
~/garry-workspaces/FEAT-123/
  shell/        worktree feat/FEAT-123  + .garry/
  checkout-mfe/ worktree feat/FEAT-123  + .garry/
  search-mfe/   worktree feat/FEAT-123  + .garry/
  .garry-workspace.json              list of repos, branch and state
```

Fan out operations (one command, all repositories): `garry ws status | sync | pr | push` (push asks for confirmation).

### Greenfield versus brownfield (legacy)

In a legacy project the worktree is non invasive: it adds a separate working directory next to the team's existing clone without breaking anything. The difference is the entry mode:

| Mode | When | What Garry does |
|---|---|---|
| scaffold | a new service | a repo from a template plus a catalog entry |
| adopt | an existing microfrontend | reverse engineers the registry from the live code |

`garry adopt <repo>`:
1. Detects the stack (Vite MF, Webpack MF, single-spa) with an adapter per stack.
2. Reads the MF config and extracts `exposes`, `remotes` and `shared`, then seeds `remotes.json` and `shared-deps.json`.
3. Generates `catalog/<svc>.yaml`.
4. Reports inconsistencies with the same `validateRegistry` (it often reveals hidden drift).
5. The human approves the derived registry before it becomes the source of truth.

Legacy edge cases Garry handles: a different base branch (`main`, `master` or `develop`, detected per repo), a MF variant other than Vite (an adapter), a service with no changes in the feature (read only in the workspace), and a local clone with uncommitted changes (the worktree is separate anyway).

## 9. Heterogeneous stacks and interoperability

Each service chooses its own technology stack. The scaffold wizard asks for the stack separately for every service. Integration is guaranteed by the contract, not by the stack. The registry contracts are the common language, so services that are built differently still connect.

Three stack agnostic layers carry the integration:

1. Federation runtime. A common protocol for loading remotes. Garry standardizes on the Module Federation 2.0 runtime (`@module-federation/enhanced`), which works across Vite, Webpack and Rspack. This is the lingua franca between bundlers.
2. Shared singletons. `shared-deps.json` enforces a single version (for example React) as a singleton, so different bundlers share the same runtime instance.
3. Tokens and the event bus. Design tokens are delivered as CSS variables and the event bus contract lives in `events.json`. Both are framework agnostic and connect even very different worlds.

Cross framework boundary: if two services use different frameworks (for example React and Vue), they do not share the internal singletons of a framework. They connect at the boundary through Web Components and the event bus.

What this changes in Garry:

- `mf-wiring` becomes stack aware. One `remotes.json` drives an adapter that generates the correct config per bundler (`vite.config`, Webpack, Rspack).
- `contract-validate` gains interoperability invariants: compatible singleton versions, a matching federation runtime, and matching exposed and consumed modules.
- The manifest gains structured stack fields (`framework`, `bundler`, `federation`) instead of a single free form string, so the interoperability checks become possible. This is planned for phase 1.

Scope for now: the project starts with microfrontends. Backend services are allowed later. When they arrive, interoperability also runs through API and event contracts (OpenAPI and AsyncAPI), not only through Module Federation.

## 10. Why start with microfrontends

Microfrontends are simpler for the first iteration because the contract is explicit and static:

- Module Federation makes it clear who exposes what (`remotes.json`).
- Shared dependency versions are an easy contract.
- Design tokens are a single source.
- No database removes the hardest part (provisioning, migrations, data consistency).

On microfrontends we refine the registry, the sync and the SDLC orchestration. Moving to the backend only adds DB provisioning, API and event contracts (OpenAPI and AsyncAPI), and migrations.

## 11. Repositories (four)

Garry is not one project but four independently versioned repositories (WHAT, HOW, WHO, FACE) plus templates.

```
garry-tool/                (WHO, the orchestrator, a headless core)
  packages/
    core/              shared types, manifest parser, dependency graph
    supervisor/        the supervisor agent: skill composition, SDLC pipeline, delegate()
    cli/               garry (scaffold | sync | feature | doctor | skills), a layer over the supervisor
    server/            API (REST and SSE or WebSocket) over the supervisor, the backend for the UI
  templates/
    mfe-shell/         Vite plus MF host
    mfe-remote/        Vite plus MF remote plus AGENTS.md
  examples/
    registry-sample/   catalog and contracts for two sample microfrontends

garry-registry/            (WHAT, published as @garry/registry)
  catalog/ contracts/ features/ adr/        schema (zod) and validation

garry-skills/              (HOW, published as @garry/skills)
  skills/ manifest.json    atomic skills and index

garry-ui/                  (FACE, Next.js, consumes garry-tool/server)
  app/ components/         dashboard, pipeline, pull requests, model and agent routing
```

Tooling stack: TypeScript and Node. UI: Next.js (React 19).

Why separate repositories: the registry changes per project or client, the skills are reusable globally, the tool and the UI have their own release cycles. Splitting them lets each layer be versioned and swapped independently. The CLI and the UI are two layers over the same supervisor, so there is no duplicated logic.

## 12. UI, GitHub, model and agent routing

Garry gets its own panel (`garry-ui`) that talks to `garry-tool/server`. The same core (the supervisor) serves both the CLI and the UI.

```
   garry-ui (Next.js) --REST+SSE--> garry-tool/server --> supervisor --> subagents
        |                                   |
        |                                   +--> narrow GitHub token (repos, PRs, checks)
        +--> browser: the human steers and watches live agent streams
```

### garry-ui stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) plus React 19 plus TS | routing, RSC for browsing the registry, can host `garry-tool/server` in route handlers |
| Styling | a custom token generator (`design-tokens.json` to `tokens.css`, CSS variables) plus CSS Modules | lightweight, no dependency, white label by overriding CSS variables |
| Components | native first: the `dialog` element, Popover API, the `details` element, native controls plus CSS Modules | lightweight, accessible, no Radix or shadcn; a fallback only when needed (Base UI) |
| Data (REST) | TanStack Query | cache, refetch, request status against `garry-tool/server` |
| Tables | TanStack Table (headless) | the logic for tables of services and pull requests, our own styling |
| Live stream | SSE (`EventSource`) | the Pipeline panel: logs of subagents per skill, live, without WebSocket overhead |
| Pipeline graph | React Flow | nodes are services and stages, edges are the delegation order from the dependency graph |
| Raw agent output | xterm.js or a virtualized log | a view of what the agent actually does |
| Forms and config | react-hook-form plus zod from `@garry/registry` | the routing matrix and contract editing validated by the same schema as the backend |

Key alignment: the UI reuses the zod schemas from `@garry/registry` and `@garry/skills`, so the same validation runs in the browser, the server and the CLI. One source of truth end to end.

White label (open source): a company overrides `tokens.css` (CSS variables) for its own branding without a fork and without recompiling components. The tokens come from `design-tokens.json`, so the theme is a part of the contract, not of the UI code.

Alternative (lighter): Vite plus a React SPA plus a separate `garry-tool/server`. Simpler and consistent with the MFE template stack, but without RSC and the API in one place.

### Panels

| Panel | Content |
|---|---|
| Dashboard | active features, the SDLC stage of each, status per repo |
| Pipeline | the dependency graph of a feature, a live stream of subagents (SSE), logs per skill |
| Registry | a view of catalog, contracts and features (live state) |
| Skills | the list of skills from `@garry/skills`, enable or disable, a view of `SKILL.md` |
| GitHub | repositories, pull requests, status checks, the branch per feature |
| Routing | the model by agent matrix per stage or skill |

### GitHub (narrow token)

Security first. A fine grained personal access token limited to the specific repositories Garry manages, with minimal permissions (`contents`, `pull_requests`). It cannot touch repositories outside the list. The token lives in `.env` and is never committed. When the project grows we can move to a GitHub App.

### Model and agent routing (the matrix)

The heart of switching models and agents. Per SDLC stage (or per skill) you choose an agent profile plus a model. This lets you control cost (a cheap model for scaffolding, a strong one for review) and swap roles.

```jsonc
// garry.routing.json (defaults plus per feature overrides in the UI)
{
  "defaults": { "agent": "garry-dev", "model": "claude-sonnet-4-6" },
  "stages": {
    "spec":      { "agent": "garry-analyst",  "model": "claude-opus-4-8" },
    "scaffold":  { "agent": "garry-dev",      "model": "claude-haiku-4-5-20251001" },
    "review":    { "agent": "garry-reviewer", "model": "claude-opus-4-8" },
    "test":      { "agent": "garry-dev",      "model": "claude-sonnet-4-6" }
  }
}
```

- An agent profile is a system prompt plus a set of tools plus the allowed skills for a role.
- A model is a specific Claude model (Opus 4.8, Sonnet 4.6, Haiku 4.5, Fable 5), switchable from the UI at runtime.
- An override per feature or per single run is stored next to the feature state in the registry.

## 13. Continuous integration, security review and code review

The repository ships with CI, a mandatory security review and automated code review from the start. The security review is a job inside the CI workflow, not a separate pipeline.

### CI workflow (`.github/workflows/ci.yml`)

- `validate` (per package): `npm ci`, `npm run typecheck` and `npm run validate`.
- `dash-guard`: runs `scripts/check-no-emdash.mjs`. The build fails if any em dash, en dash, figure dash or horizontal bar is found in tracked text files, which enforces the plain ASCII punctuation rule automatically.
- `security`: the security review as CI steps. It runs `npm audit` (fails on a high or critical advisory) for both packages and a Semgrep static analysis scan. The repository is private, so CodeQL and dependency review are not used (both need paid GitHub Advanced Security on a private repository); Semgrep runs entirely inside the job with no token.

Dependabot (`.github/dependabot.yml`) adds weekly updates for npm dependencies and GitHub Actions.

### Mandatory on every commit

`main` is protected. A pull request is required and every CI job (validate, dash guard and security) must be green before a merge. This makes the security review mandatory for every commit, with no other option.

### Code review

Copilot reviews pull requests for free, following `.github/copilot-instructions.md` (English only, no em dashes, contract first, security notes). Automatic review is requested on every pull request in the repository settings.

## 14. Implementation plan (phased)

- Phase 0, format foundations. Done. `garry-registry` (zod schema and validation plus a sample) and `garry-skills` (the `SKILL.md` format, `manifest.json`, a validator and the first end to end skill `contract-validate`). CI and the dash guard included.
- Phase 1, scaffolding and wizard. The `scaffold-mfe-shell` and `scaffold-mfe-remote` skills, structured stack fields in the manifest, `garry scaffold`, a catalog entry and `AGENTS.md`, all in the interactive wizard mode (ANSI banner, stepper, loaders).
- Phase 2, sync. The `sync-contracts` and `generate-types` skills into `.garry/`.
- Phase 3, workspace (multicheckout). A clone cache plus a git worktree per feature, fan out (`garry ws status | sync | pr | push`) and the `feat/<FEAT-id>` branch.
- Phase 4, SDLC orchestration. The supervisor: skill composition from `manifest.json`, the dependency graph, `delegate()` over the workspace and `garry feature`.
- Phase 5, server and routing. `garry-tool/server` (REST and SSE over the supervisor) plus `garry.routing.json` (the model by agent matrix).
- Phase 6, GitHub (narrow token). A fine grained PAT limited to the listed repositories; branch and pull request per feature, status checks.
- Phase 7, UI. `garry-ui` (Next.js): Dashboard, Pipeline (live stream), Registry and Skills, GitHub and Routing.
- Phase 8, adopt (brownfield). Reverse engineer the registry from legacy microfrontends plus stack adapters (Vite, Webpack MF, single-spa).
- Phase 9, backend generalization. DB provisioning skills, API and event contracts, migrations.
