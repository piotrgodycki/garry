# The Garry SDLC

How a feature travels from an idea to production with Garry, what happens at
each stage, and what you do as the human in the loop. For the commands
themselves see [cli.md](./cli.md).

> **Status today.** Garry composes the full pipeline (stages, skills, agents,
> models, delegation order) and shows it in the CLI and in the dashboard, but the
> agents do not call a model yet: `garry feature` is a dry run and the dashboard
> replays the plan as a simulation. The live executor on the Claude Agent SDK is
> the next phase. Everything below marked *planned* is designed, not built.

## The idea in one paragraph

You talk to one supervisor, Garry. Garry turns the conversation into a feature,
works out which services it touches, updates the cross service contracts first,
and then delegates the work to one agent per service repository, in the order the
contracts require. Every agent gets only the skills it needs for its stage. You
review pull requests (with screenshots) and approve; the agents build, review,
test and ship.

## The building blocks

| Block | Where | What it is |
|---|---|---|
| Feature | `garry-registry/.../features/FEAT-x.md` | the unit of work: id, title, status, services, contract changes, optional routing override |
| Service manifest | `.../catalog/<service>.yaml` | one per service: repo url, stack, owner, what it exposes and consumes |
| Contracts | `.../contracts/*.json` | the shared truth between services: remotes, shared deps, events, design tokens, APIs |
| Skill | `garry-skills/skills/<stage>/<name>/SKILL.md` | one atomic capability of an agent, indexed in `garry-skills/manifest.json` |
| Routing | `garry.routing.json` | which agent role and which model handles each stage |
| Workspace | `~/garry-workspaces/FEAT-x/` | one git worktree per service on the shared branch `feat/FEAT-x` |

The sample registry (`garry-registry/examples/registry-sample`) ships one feature,
`FEAT-123`, that touches three microfrontends: `shell`, `checkout-mfe` and
`search-mfe`.

## The rule that orders everything: contract first

Nobody touches code until the contract in the registry is updated and validated.
A service that consumes something from another service depends on it, so the
producer goes first. For FEAT-123 that gives:

```
events.json (cart:item-added)
   -> search-mfe    (produces the event)
   -> checkout-mfe  (consumes it, renders CartSummary)
   -> shell         (cart preview in the header)
```

`garry feature FEAT-123` prints this as `search-mfe -> checkout-mfe -> shell`.

## The seven stages

Spec, Plan, Design and Integrate run once per feature on the supervisor.
Implement, Review and Test run once per service, in the delegation order. FEAT-123
therefore has 4 + 3 x 3 = 13 tasks.

| # | Stage | Runs | Agent and model (default routing) | Skills | Output |
|---|---|---|---|---|---|
| 1 | Spec | once | garry-analyst, Opus | `spec-draft`, `spec-decompose`, `acceptance-criteria` | `features/FEAT-x.md` with services and acceptance criteria |
| 2 | Plan | once | garry-analyst, Opus | `impact-analysis`, `dependency-graph`, `work-breakdown` | impact report, delegation order, tasks per repo |
| 3 | Design | once | garry-analyst, Opus | `contract-update`, `contract-validate`, `version-bump`, `design-tokens-sync`, `api-contract` | updated and validated contracts in the registry |
| 4 | Implement | per service | garry-dev, Haiku | `scaffold-mfe-shell`, `scaffold-mfe-remote`, `sync-contracts`, `generate-types`, `mf-wiring`, `db-provision`, `db-migrate` | code on `feat/FEAT-x` in each repo |
| 5 | Review | per service | garry-reviewer, Opus | `review-correctness`, `review-spec-match`, `review-contract-compliance`, `review-security`, `review-screenshots` | a reviewed pull request with screenshots |
| 6 | Test | per service | garry-dev, Sonnet | `test-unit`, `test-e2e`, `drift-check`, `api-compatibility` | green tests, no contract drift |
| 7 | Integrate | once | garry-dev, Sonnet | `cross-repo-merge`, `version-tag`, `changelog` | all pull requests merged together, a version tag, a changelog |

The skill lists come from `garry-skills/manifest.json`; adding a skill there adds
it to its stage everywhere. Some skills are planned (no `SKILL.md` yet);
`pnpm -C garry-skills validate` lists them as warnings.

### What you do at each stage

| Stage | You |
|---|---|
| Spec | Drop an idea on the dashboard and talk it through with Garry (Talk to Garry, Cmd or Ctrl+K). An idea becomes a feature only after that conversation. |
| Plan, Design | Nothing, unless a contract change needs a human decision. Watch it on Live agents. |
| Implement | Nothing. Each service shows its current step on Live agents; click a service for its detailed work log. Stop all agents is the kill switch. |
| Review | Review the pull requests. Each one shows before and after screenshots of every changed view. Approve or request changes. |
| Test | Nothing, unless a test fails and Garry asks. |
| Integrate | Approve the merge. Garry merges every repo together and tags the version. |

## Choosing models: routing

`garry.routing.json` maps each stage to an agent role and a model:

```json
{
  "defaults": { "agent": "garry-dev", "model": "claude-sonnet-4-6" },
  "stages": { "review": { "agent": "garry-reviewer", "model": "claude-opus-4-8" } }
}
```

Precedence for a stage: the feature's `routingOverride` wins, then the stage entry,
then `defaults`. You can change a stage's model on the Model routing page and a single service's
model on the feature's pipeline page (`/pipeline/FEAT-x`); the agent role stays.

## Working with real repositories

1. Register each service: write `catalog/<service>.yaml` by hand, generate one for
   a new service with `garry scaffold`, or reverse engineer one from an existing
   repo with `garry adopt <repo> --write` (review it before trusting it).
2. Write the feature: `features/FEAT-x.md` with `id`, `title`, `status` and
   `services` in the frontmatter.
3. `garry ws create FEAT-x` checks out every service on `feat/FEAT-x` as git
   worktrees under `~/garry-workspaces/FEAT-x/`. Your own checkouts stay untouched.
4. `garry ws sync FEAT-x` puts each service's contract slice and generated types
   into its `.garry/` folder.
5. `garry feature FEAT-x` prints the plan (and, once the executor lands, runs it).
6. `garry ws push FEAT-x`, then `garry ws pr FEAT-x` opens one draft pull request
   per service. This needs `GARRY_GITHUB_TOKEN` in `.env`.
7. Mark the pull requests ready for review (or request a reviewer). The PR
   screenshots workflow then posts before and after screenshots on each one.

## Code review with screenshots

When a pull request goes to review (out of draft, or a review requested from a
person or a review agent) the `pr-screenshots` workflow builds the base and the
head, captures every view in `garry.screenshots.json` in headless Chromium
(desktop and mobile, light and dark) and keeps one comment on the pull request
with before, after and a pixel diff of each changed view. It updates on every
push while the pull request is in review. Details in the
[README](../README.md#screenshots-on-pull-requests) and in the
`review-screenshots` skill.

## What is built and what is planned

| Piece | State |
|---|---|
| Registry, contracts, validation | built |
| Skills manifest and validation | built (some skills planned) |
| Pipeline composition, delegation order, routing | built |
| Workspaces (worktrees), contract sync, draft pull requests | built |
| Dashboard and live view of the plan | built (simulated stream) |
| Screenshots on pull requests | built |
| Agents that call a model and write code | planned (Claude Agent SDK executor) |
| `garry doctor`, `garry skills` | planned |
