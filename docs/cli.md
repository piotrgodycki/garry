# The garry CLI

Every command, its options and an example. For how the commands fit together
into a feature's lifecycle see [sdlc.md](./sdlc.md).

## Running it

From npm (Node 22 or newer):

```bash
npx garry --help          # no install
npm install -g garry      # or install the garry command
garry feature FEAT-123
```

Inside this repository run it from the root through pnpm instead, so you use the
code you are working on:

```bash
pnpm install          # once
pnpm garry --help     # the same as "garry --help"
```

Shortcuts in the root `package.json`:

| Shortcut | Same as |
|---|---|
| `pnpm dev` | `garry serve` plus the dashboard with hot reload on http://localhost:3000 |
| `pnpm serve` | `garry serve` |
| `pnpm ui` | the dashboard only (needs the server) |
| `pnpm scaffold` | `garry scaffold` |

Requirements: Node 22 or newer, and pnpm 10 inside the repository.

Where the commands look when you pass no flag:

| What | Inside this repository | Anywhere else |
|---|---|---|
| registry (`--registry`) | `./registry` if it has a `catalog/`, else `~/.garry/registry` (created empty) | the same |
| pre-installed skills (`--skills`) | `garry-tool/skills` | the skills shipped with the package |
| routing (`--routing`) | `garry.routing.json`: Garry's setup for the default profile | `garry.routing.json` in the current folder (optional); profiles of your own live in the registry (`garry routing`) |

The npm package is the CLI and the server (`garry serve`); the dashboard runs from
this repository (`pnpm ui`). `garry shots` needs Playwright as well
(`npm install playwright`, then `npx playwright install chromium`).

## Commands at a glance

| Command | What it does |
|---|---|
| `garry feature <id>` | plan a feature through the SDLC (dry run today); `new` and `list` create and list them |
| `garry ws <sub> [id]` | work on all services of a feature at once (git worktrees) |
| `garry service <sub>` | the services in the registry (`list`, `add`, `remove`) |
| `garry architecture <sub>` | the architecture board: `check`, `show`, `blocks` |
| `garry routing <sub>` | routing profiles: which agent and model per stage (`list`, `show`, `new`, `use`, `set`, `remove`) |
| `garry stack <sub>` | the tech stacks services are built with (`list`, `catalog`, `ready`, `add`, `check`, `remove`) |
| `garry scaffold [name]` | create a new microfrontend and register it |
| `garry adopt <repo>` | derive a registry entry from an existing repo |
| `garry sync` | put a service's contracts and generated types into `.garry/` |
| `garry skills <sub>` | list skills, install or remove local ones |
| `garry serve` | start the HTTP server the dashboard talks to |
| `garry pair` | pair a phone or another computer (QR code) |
| `garry devices` | list or revoke paired devices |
| `garry project` | Garry projects: `list`, `new`, `use`, `export`, `import` (one `.garry.json` file), `remove` |
| `garry repos` | the repositories of the active project (`list`, `add <path>`, `import <owner/name>`, `settings <repo>`; `garry projects` is the old name) |
| `garry github <sub>` | connect GitHub (`status`, `login [--token]`, `logout`, `repos [query]`) |
| `garry shots <sub>` | screenshots for code review |
| `garry qa` | does a change need a person to try it (label and checklist on the PR) |

## garry feature

```
garry feature <featId> [--registry <path>] [--skills <path>] [--routing <file>] [--root <dir>] [--ws <dir>]
garry feature new "<title>" [--goal <text>] [--services <a,b>] [--contracts <events.json,...>]
garry feature list
```

`new` writes `features/FEAT-<n>-<slug>.md` in the registry at the spec stage,
with the next free number; the services must be in the registry and may be left
out while the feature is still a spec. The dashboard (New feature, or Make it a
feature on an idea) and the phone (New feature) do the same through
`POST /api/features`; `DELETE /api/features/:id` works from this computer only.

Reads `features/<featId>`, works out the delegation order (contract first),
composes the stages from the skills manifest and resolves the agent and model per
stage. Prints every task; calls no model yet.

```bash
pnpm garry feature FEAT-123
# services (delegation order): search-mfe -> checkout-mfe -> shell
# [spec] supervisor via garry-analyst:claude-opus-5-5
# [implement] search-mfe via garry-dev:claude-haiku-5-5
# ...
# Plan complete. This was a dry run; no model was called.
```

| Option | Default | |
|---|---|---|
| `--registry` | `./registry`, else `~/.garry/registry` | registry root |
| `--skills` | the skills shipped with garry | skills root |
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
| `--registry` | `./registry`, else `~/.garry/registry` | services and repo urls come from here |
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

`ws create` clones the repositories the manifests name, so each service needs a
real `repo` url.

`ws pr` needs a fine grained token in `.env.local` at the repository root (copy
`.env.example`):

```
GARRY_GITHUB_TOKEN=github_pat_...
```

Give it read and write access to pull requests and contents on the service
repositories only. It is never logged.

## garry service

The services in the registry, one manifest each in `catalog/<name>.yaml`. Garry
ships none: add the ones you have here or in the dashboard (Services, Add
service). `garry scaffold` creates the code of a new microfrontend and adds it as
well; `garry adopt` derives the entry from an existing repository.

```bash
garry service list
garry service add checkout --kind mfe-remote --repo git@github.com:acme/checkout.git \
  --owner team-payments --exposes ./Checkout,./CartSummary --consumes shell:./AuthContext
garry service remove checkout   # refused while another service consumes it
```

| Option | Default | What it does |
|---|---|---|
| `--kind` | (required) | see the kinds below |
| `--repo` | (required) | the service's git repository |
| `--owner` | `unassigned` | the owning team |
| `--stack` | by kind | e.g. `react + vite + module-federation-2` |
| `--exposes` | none | what it offers, comma separated: modules (microfrontend), endpoints (API, BFF, function) or jobs (worker) |
| `--consumes` | none | `service:a,b`, repeatable; each must be exposed by that service |
| `--replace` | off | overwrite an existing manifest |

Kinds (`GET /api/service-kinds` lists them with a description each):

| Kind | What it is | Default stack | May own a database |
|---|---|---|---|
| `mfe-remote` | microfrontend: a part of a page a shell loads at run time | react + vite + module-federation-2 | no |
| `mfe-shell` | shell: the host page that loads the microfrontends | react + vite + module-federation-2 | no |
| `spa` | single-page app, rendered in the browser | react + vite | no |
| `ssr` | server-rendered app | next.js | yes |
| `isr` | static pages rebuilt in the background (ISR) | next.js | yes |
| `ssg` | static site, built ahead of time | astro | no |
| `mobile` | iPhone or Android app | expo + react-native | no |
| `backend` | API | node | yes |
| `bff` | backend for frontend: an API made for one frontend | node + fastify | no |
| `worker` | background jobs, from a queue or a schedule | node + bullmq | yes |
| `function` | serverless function | node | yes |

On the architecture board each kind needs what it cannot work without: a BFF
an API behind it, a worker a queue, a server-rendered app a place to run, a
mobile app an API.

The server takes the same as `POST /api/registry/services`; `DELETE
/api/registry/services/:name` works from this computer only.

## garry architecture

The architecture boards: the whole project's (`architecture.json` in the
registry) and one per repository (`architecture/<repo>.json`). Each holds your services and
the platforms they run on (AWS, Cloudflare, Vercel, Netlify, Supabase,
self-hosted, SaaS), joined like puzzle pieces. Every block provides some
capabilities (web, HTTP API, SQL, cache, queue, events, file storage, sign in,
CDN, CMS content, ...) and needs others; a link always goes from a need to a
block that provides it, so only fitting pieces join. Build it on the dashboard's
Architecture page, step by step with the wizard (who uses it, where it runs:
Vercel, Cloudflare, AWS, Supabase, your own server or Kubernetes; what data it
keeps; what else it needs) or by hand (drag blocks in, join a need on the right
of a block to a provide on the left of another); it saves itself. The wizard's
answers are kept with the board, so it opens with them again; a board is reset
on its own, on the computer running Garry, after you confirm.

```bash
garry architecture blocks   # every block, what it provides and needs
garry architecture show
garry architecture check    # exit code 1 when something does not fit
garry architecture check --board shop   # a repository's board
```

The check reports links to something that does not provide what is needed,
blocks that are only reachable from their own platform (D1, KV and Queues from
Workers, ElastiCache from AWS), needs left open (WordPress without a database, a
backend with a database but none linked, a shell without its microfrontends),
RDS reached from outside AWS without pooling, and registry services that are not
on the board yet. The registry check (`pnpm -C garry-tool check:registry <dir>`) reports the
errors too. The page also offers **quick fixes** for every open need (a
block that provides it, the platform you already use first, never one that
cannot be reached from there) and **Ask Garry**: describe what it is for, and
Garry (Claude Code on this computer, on your own Claude plan, with the design
stage's model from the active routing) suggests blocks and links with the reason
for each; one click adds a suggestion to the board. Server: `GET /api/architecture`, `POST /api/architecture`, `POST
/api/architecture/check`, `POST /api/architecture/suggest {goal?, ai?, board?}`.

## garry routing

Routing profiles: which agent role and which model handle each SDLC stage.
`default` is used unless another is active. It starts as Garry's setup (the
folder's `garry.routing.json`, else the built-in); change it like any profile
(saved as `routing/default.json`) and `garry routing remove default` puts
Garry's setup back. Make your own from it and make one the active one; a feature can use another with `routing: <name>` in its
frontmatter (the New feature form has a picker). Profiles live in the registry
as `routing/<name>.json`, the active one in `routing/index.json`. The Model
routing page does the same.

```bash
garry routing list
garry routing set default implement --model claude-sonnet-5-5
garry routing new fast --from default
garry routing set fast implement --model claude-sonnet-5-5
garry routing set fast review --agent garry-reviewer --model claude-opus-5-5
garry routing use fast
garry routing show fast
```

A feature's `routingOverride` still wins for the stages it names. Server: `GET
/api/routings`, `POST /api/routings` (`{name, from}` or a full profile), `POST
/api/routings/active`, `POST /api/routing {profile?, stage, model?, agent?}`,
`DELETE /api/routings/:name` (this computer only; for `default`, back to Garry's setup). `GET /api/routing` returns
the active profile.

## garry stack

The tech stacks in the registry, one per `stacks/<name>.yaml`: named sets of
technologies your services are built with. Garry's catalog covers languages, UI
and app frameworks, bundlers, microfrontends, runtimes, backend frameworks,
databases, ORMs, caches, queues, storage, auth, CMSs, hosting, testing, CI and
observability, and its rules flag what does not fit (Next.js with Vite,
WordPress on Vercel, D1 without Workers, two runtimes). A conflict is reported,
not refused. The dashboard's Stacks page does the same with a picker.

Ready-made stacks are well known combinations to start from, each checked
against the rules: Microfrontends, MERN, MEAN, MEVN, PERN, LAMP, Jamstack,
type-safe Next.js (tRPC, Prisma, Tailwind), TanStack Start, Remix, a React SPA;
backends in every common language: a Node.js API, NestJS, Python with FastAPI,
Django, Go, Java and Kotlin with Spring Boot, .NET, Laravel, Ruby on Rails,
Elixir with Phoenix, an API at the edge (Hono on Workers), event-driven with
Kafka and a background worker; and Expo, React Native, iOS with SwiftUI, Android
with Jetpack Compose and Flutter. The Stacks page lists them (Use this), and Add service offers the ones
that suit the kind of service being added.

```bash
garry stack ready                       # the ready-made stacks
garry stack add shop --from pern --tech react@19
garry stack catalog
garry stack check nextjs,vite,react
garry stack add web --tech typescript,react@19,vite,module-federation,tailwind --description "Our microfrontends"
garry service add shop --kind mfe-remote --repo git@github.com:acme/shop.git --stack-ref web
garry stack list
garry stack remove web          # refused while a service is built on it
```

A service with `stackRef` gets its stack line filled from the stack, the registry
check reports a `stackRef` with no stack, and `garry sync` writes the stack to
`.garry/stack.json` in the service's repository so its agent works in it. Server:
`GET /api/stacks` (stacks, catalog, categories, ready-made stacks), `POST /api/stacks`, `POST
/api/stacks/check`, `DELETE /api/stacks/:name` (this computer only).

More commands (scaffold, adopt, sync, skills, project, github, serve, qa, shots, hooks) and the configuration files: [cli-more.md](./cli-more.md).
