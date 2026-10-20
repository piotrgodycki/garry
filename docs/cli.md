# The garry CLI

Every command, its options and an example. For how the commands fit together
into a feature's lifecycle see [sdlc.md](./sdlc.md).

## Running it

The CLI lives in `garry-tool` and is not published yet, so run it from the root of
this repository through pnpm:

```bash
pnpm install          # once
pnpm garry --help     # the same as "garry --help" once published
```

Shortcuts in the root `package.json`:

| Shortcut | Same as |
|---|---|
| `pnpm dev` | `garry serve` plus the dashboard on http://localhost:3000 |
| `pnpm serve` | `garry serve` |
| `pnpm ui` | the dashboard only (needs the server) |
| `pnpm scaffold` | `garry scaffold` |

Requirements: Node 22 or newer and pnpm 10.

Most commands read the sample registry by default
(`garry-registry/examples/registry-sample`); point them at your own with
`--registry <path>`.

## Commands at a glance

| Command | What it does |
|---|---|
| `garry feature <id>` | plan a feature through the SDLC (dry run today) |
| `garry ws <sub> [id]` | work on all services of a feature at once (git worktrees) |
| `garry scaffold [name]` | create a new microfrontend and register it |
| `garry adopt <repo>` | derive a registry entry from an existing repo |
| `garry sync` | put a service's contracts and generated types into `.garry/` |
| `garry skills <sub>` | list skills, install or remove local ones |
| `garry serve` | start the HTTP server the dashboard talks to |
| `garry shots <sub>` | screenshots for code review |

## garry feature

```
garry feature <featId> [--registry <path>] [--skills <path>] [--routing <file>] [--root <dir>] [--ws <dir>]
```

Reads `features/<featId>`, works out the delegation order (contract first),
composes the stages from the skills manifest and resolves the agent and model per
stage. Prints every task; calls no model yet.

```bash
pnpm garry feature FEAT-123
# services (delegation order): search-mfe -> checkout-mfe -> shell
# [spec] supervisor via garry-analyst:claude-opus-4-8
# [implement] search-mfe via garry-dev:claude-haiku-4-5-20251001
# ...
# Plan complete. This was a dry run; no model was called.
```

| Option | Default | |
|---|---|---|
| `--registry` | the sample registry | registry root |
| `--skills` | `garry-skills` | skills repo root |
| `--routing` | `garry.routing.json` | routing matrix |
| `--root` or `--ws` | none | where the feature's worktrees are, so the tasks point at real directories |

## garry ws

```
garry ws <create|status|sync|push|pr> [featId] [options]
```

A workspace is the feature on disk: one git worktree per service, all on the
branch `feat/<featId>`. Garry keeps a mirror clone of each repo in a cache and
never touches your own checkouts.

| Subcommand | What it does |
|---|---|
| `create <featId>` | clone (mirror, once) and add a worktree per service under `~/garry-workspaces/<featId>/` |
| `status <featId>` | `git status` across every worktree |
| `sync <featId>` | `garry sync` in every worktree |
| `push <featId>` | push every worktree (asks first unless `--yes`) |
| `pr <featId>` | open one draft pull request per service; without a token it only prints what it would open |

Every subcommand needs the feature id, or `--ws <dir>` pointing at the workspace.

| Option | Default | |
|---|---|---|
| `--registry` | the sample registry | services and repo urls come from here |
| `--cache` | `~/.garry/cache` | mirror clones |
| `--root` | `~/garry-workspaces` | workspaces root |
| `--ws` | | an explicit workspace directory |
| `--yes`, `-y` | | no prompts |

```bash
pnpm garry ws create FEAT-123
pnpm garry ws status FEAT-123
pnpm garry ws sync FEAT-123
pnpm garry ws push FEAT-123 --yes
pnpm garry ws pr FEAT-123
```

The sample registry uses placeholder repo urls (`git@github.com:example/...`), so
`ws create` only works once the manifests point at real repositories.

`ws pr` needs a fine grained token in `.env` at the repository root:

```
GARRY_GITHUB_TOKEN=github_pat_...
```

Give it read and write access to pull requests and contents on the service
repositories only. It is never logged.

## garry scaffold

```
garry scaffold [name] [--kind shell|remote] [--framework react] [--bundler vite]
               [--federation module-federation-2] [--owner <team>] [--registry <path>] [--out <dir>] [--yes]
```

Creates a microfrontend (React with Vite and Module Federation) and writes its
manifest into the registry's `catalog/`. In a terminal it runs as an interactive
wizard; with `--yes` and the required options it runs headless.

```bash
pnpm scaffold                                              # wizard
pnpm garry scaffold cart-mfe --kind remote --owner team-payments --yes
```

The new repo gets `package.json`, the Vite and federation config, a starter app,
`AGENTS.md` (instructions for the agents working in it) and `.garry/service.json`.

## garry adopt

```
garry adopt <repo> [--registry <path>] [--write]
```

For an existing microfrontend (or a folder of them): detects the stack, reads the
Module Federation config and derives a service manifest plus a remotes entry.
Prints the result by default; `--write` saves it into the registry. Review it
before trusting it.

```bash
pnpm garry adopt ../legacy-checkout
pnpm garry adopt ../legacy-checkout --write
```

## garry sync

```
garry sync [--repo <dir>] [--service <name>] [--registry <path>] [--yes]
```

Run inside a service repo. Copies the slice of contracts that service may rely on
into `.garry/contracts/` and generates `.garry/types/contracts.d.ts`, so the code
is typed against the registry, not against another service's internals. The
service name comes from `.garry/service.json` when not given.

```bash
# from the root of this repository
pnpm garry sync --repo ~/garry-workspaces/FEAT-123/checkout-mfe
```

## garry skills

```
garry skills list
garry skills add <folder|SKILL.md> [--stage <stage>] [--replace] [--accept-warnings]
garry skills remove <name>
garry skills audit [folder ...]
```

The skills the agents use: the pre-installed ones in `garry-skills`, plus the ones
installed locally on this machine in `~/.garry/skills` (or `GARRY_SKILLS_HOME`).
A local skill joins its stage in every feature's plan. The same is available on
the dashboard's Skills page (Install skill).

```bash
pnpm garry skills add ~/my-skills/a11y-audit
pnpm garry skills list            # a11y-audit shows as local under review
pnpm garry skills remove a11y-audit
```

`add` reads the YAML frontmatter of `SKILL.md` (`name`, `description`, optional
`stage` and `dependsOn`), refuses a name a pre-installed skill already uses, and
copies the folder without symlinks, up to 50 files and 2 MB. Pass `--stage` when
the frontmatter has none and `--replace` to overwrite a local skill.

### Security audit

Every skill is audited before an agent may use it: on `add` (and in the
dashboard's Install dialog), every time local skills are loaded, so a file edited
on disk after install is caught, and the pre-installed ones in CI. The audit reads
every file of the skill and looks for:

| Severity | Finds |
|---|---|
| critical | code downloaded and run (`curl ... \| sh`), decoded payloads run, reverse shells, destructive commands, secrets sent over the network, "ignore previous instructions", invisible Unicode that hides text (bidirectional overrides, tag characters) |
| high | hiding actions from the human, role or persona overrides, safety bypasses (`--no-verify`, force push, `sudo`, skipping review), persistence (shell profiles, cron, `authorized_keys`), raw IPs, paste sites and tunnels, encoded blobs, zero width characters, edits to CI workflows or git hooks, binary files |
| medium | reading secrets or credential files, installing packages, scripts that start processes, sites outside a list of known documentation and package hosts, text hidden in HTML comments, unrestricted `allowed-tools` |

A critical or high finding fails the audit: the skill cannot be installed, and an
installed one that starts failing is left out of every plan. Medium findings are
warnings: `add` needs `--accept-warnings` (the dialog, a checkbox) after you read
them.

```bash
pnpm garry skills audit                    # every installed skill, exit 1 on a failure
pnpm garry skills audit ~/downloads/skill  # a folder before you install it
pnpm -C garry-tool test:audit              # the audit's own regression corpus
```

The audit is static: rules over the text, no model. It catches known attack
shapes, not every possible one, so read a skill from an unknown source anyway.

## garry serve

```
garry serve [--port 8123] [--registry <path>] [--skills <path>] [--routing <file>] [--root <dir>]
```

The HTTP server (REST plus server sent events) the dashboard uses. Usually started
by `pnpm dev`. Main endpoints:

| Endpoint | |
|---|---|
| `GET /api/features` | features with status and services |
| `GET /api/features/:id/plan` | the composed plan |
| `GET /api/features/:id/stream` | the live delegation stream (SSE) |
| `GET /api/features/:id/prs` | one pull request per service |
| `GET /api/registry`, `/api/skills`, `/api/models`, `/api/routing` | registry, skills, models, routing |
| `GET /api/skills/:name/doc` | a skill's `SKILL.md` |
| `POST /api/skills/install` `{content or path, stage?, replace?, dryRun?, acknowledge?}` | audit, then install a local skill (`dryRun` previews the skill and its audit) |
| `GET /api/skills/:name/audit` | a skill's full security audit |
| `DELETE /api/skills/:name` | remove a local skill |
| `POST /api/routing` `{stage, model}` | change a stage's model in `garry.routing.json` |
| `POST /api/features/:id/service-models` `{service, model}` | change one service's model |

The dashboard reads the server url from `NEXT_PUBLIC_GARRY_SERVER`
(default `http://localhost:8123`).

Writes (`POST`, `DELETE`) are accepted only from the dashboard's origin
(`http://localhost:3000`) or with no `Origin` header (the CLI, curl), so another
website open in your browser cannot change routing or install a skill through
localhost. Serve the dashboard from somewhere else and list it in
`GARRY_UI_ORIGINS` (comma separated).

## garry shots

```
garry shots capture --url <app url> --out <dir> [--config garry.screenshots.json]
garry shots compare --base <dir> --head <dir> --out <dir> [--base-label <s>] [--head-label <s>]
garry shots comment --report <report.json> --repo <owner/name> --pr <n> --images-url <template> [--run-url <url>] [--dry-run]
```

Screenshots for code review, used by the `pr-screenshots` workflow and runnable
locally:

- `capture` opens every route in `garry.screenshots.json` in headless Chromium,
  in each viewport and theme, and saves full page PNGs.
- `compare` diffs two captures pixel by pixel and writes `report.json` plus
  `base/`, `head/` and `diff/` images.
- `comment` creates or updates the one screenshot comment on a pull request
  (`GITHUB_TOKEN` or `GARRY_GITHUB_TOKEN`). `--dry-run` writes `comment.md` instead.
  `--images-url` turns a report path into an image url and must contain `{path}`.

```bash
pnpm -C garry-tool exec playwright install chromium     # once
pnpm dev                                                 # in another terminal
pnpm garry shots capture --url http://localhost:3000 --out shots/head
```

Set `GARRY_CHROMIUM_PATH` to use an already installed Chromium.

## Configuration files

| File | Used by | |
|---|---|---|
| `garry.routing.json` | `feature`, `serve` | agent and model per stage |
| `garry.screenshots.json` | `shots` | routes, viewports and themes to capture |
| `.env` | `ws pr`, `shots comment` | `GARRY_GITHUB_TOKEN` |
| `~/.garry/skills/` | `skills`, `feature`, `serve` | locally installed skills |
| `garry-skills/manifest.json` | `feature`, `serve` | the skills per stage |
| `garry-registry/.../features/*.md` | `feature`, `ws`, `serve` | the features |
| `garry-registry/.../catalog/*.yaml` | everything | the services |
