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
ships none: add the ones you have here or in the dashboard (Registry, Add
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
type-safe Next.js (tRPC, Prisma, Tailwind), TanStack Start, Remix, a React SPA,
a Node.js API, Kotlin with Spring Boot, event-driven with Kafka, a background
worker, Expo, React Native, iOS with SwiftUI, Android with Jetpack Compose and
Flutter. The Stacks page lists them (Use this), and Add service offers the ones
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
garry skills propose <folder|SKILL.md> [--stage <stage>] [--accept-warnings]
garry skills audit [folder ...] [--report <file>]
```

The skills the agents use: the pre-installed ones in `garry-tool/skills`, plus the ones
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

### Proposing a skill to the team

`propose` (or Propose to team in the dashboard) runs the same audit, then opens a
pull request that adds the skill to the pre-installed ones:
`garry-tool/skills/skills/<stage>/<name>/` plus a `manifest.json` entry, on the branch
`skills/add-<name>`, ready for review. The `skill-audit` workflow audits it again
with a secret scanner and Semgrep, a code owner approves it, and after the merge
every teammate gets it. A skill that fails the audit is never proposed.

It needs `GARRY_GITHUB_TOKEN` with contents and pull request write access on the
repository. The repository is `GARRY_SKILLS_REPO` (`owner/name`) or, by default,
the `origin` of this checkout.

| Variable | |
|---|---|
| `GARRY_SKILLS_POLICY` | `ci-only` turns local installs off: skills only arrive through a reviewed pull request |
| `GARRY_SKILLS_REPO` | where proposals go, `owner/name` |
| `GARRY_SKILLS_HOME` | where local skills live, default `~/.garry/skills` |
| `GARRY_GITHUB_API` | GitHub Enterprise API url, default `https://api.github.com` |

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

## garry project

A Garry project is everything one product is made of: its registry (services,
contracts, features, stacks, routing, the architecture board) and the
repositories agents work on in it, with their push settings. Switch in the
dashboard (the switcher at the top of the sidebar) or here; every command and
page then works on that project. The default project is the registry Garry
always used (`~/.garry/registry`); new ones live in
`~/.garry/garry-projects/<id>/`. `./registry` in the current folder still wins
when it holds a catalog.

```bash
garry project list
garry project new "Shop v2"
garry project use shop-v2
garry project export --out shop.garry.json   # the active project, or name one
garry project import shop.garry.json         # a new project from the file
```

The `.garry.json` file holds the registry files and the repositories as
remotes to clone, never tokens, never code; credentials in a remote URL are
dropped. Import only ever writes registry files (`catalog/`, `contracts/`,
`features/`, `stacks/`, `routing/`, `adr/`, `architecture.json`) into the new
project's folder, and refuses a file that names anything else. The
repositories it lists show on the Build page with a Clone button (GitHub).
Settings, Projects does all of this in the dashboard, on this computer only.

## garry github

Connects Garry to GitHub, so you can import repositories as projects and open
pull requests without editing files. The token comes from, in order:
`GARRY_GITHUB_TOKEN` (`.env.local`), the token saved when you connected in Garry
(`~/.garry/github.json`, readable by you only), or the GitHub CLI's own sign in
(`gh auth token`).

```bash
garry github status           # who is connected, and through what
garry github login            # sign in with a code (GARRY_GITHUB_CLIENT_ID set), else paste a token
garry github login --token    # paste a personal access token
garry github repos shop       # your repositories, filtered
garry repos import octo/shop      # clone into ~/.garry/repos/octo/shop and add it to the active project
garry github logout           # forget the token Garry saved
```

The dashboard does the same in Settings (GitHub: paste, replace or remove
the token) and on the Build page (Import from GitHub), on this computer only: a paired phone cannot connect GitHub or import. Pushes and clones
pass the token to git for that one command; it is never written into a
repository's config.

### Pushing: per project

Agents never push: they have no push tool, and `git push`, `gh pr` and
`git remote` are blocked for them. A push happens only when you open a pull
request from Garry, and each project decides how:

| Setting | Default | |
|---|---|---|
| push | `ask` | `ask`: Garry shows the branch, the remote, the base and the commits and waits for your yes (Touch ID or Face ID in the apps); `allow`: opening a PR pushes straight away; `never`: nothing leaves this computer |
| base branch | the repository's default | where pull requests go |
| branch prefix | `garry/` | new work: `garry/<what>-<id>` |
| protected branches | `main, master, develop, release/*` | never pushed to, even with a yes |
| draft PRs | off | open pull requests as drafts |

Pushes are never forced and push only the thread's own branch. Change the
settings on the Build page (Push and branch settings, this computer only) or:

```bash
garry repos settings shop                          # show
garry repos settings shop --push never
garry repos settings shop --base develop --draft true --protect "main,prod/*"
```

## garry serve

```
garry serve [--port 8123] [--host 127.0.0.1] [--ui <dir>] [--registry <path>] [--skills <path>] [--routing <file>] [--root <dir>]
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
| `POST /api/skills/propose` `{content or path, stage?, acknowledge?}` | audit, then open a pull request that proposes the skill to the team |
| `POST /api/routing` `{profile?, stage, model?, agent?}` | change a stage in a routing profile of your own (the active one by default) |
| `POST /api/features/:id/service-models` `{service, model}` | change one service's model |

`garry serve` also hosts the dashboard (`garry-ui/dist` after
`pnpm -C garry-ui build`, or the one shipped in the npm package; `--ui <dir>`
picks another) on the same port, so http://localhost:8123 is the whole app. In
development `pnpm ui` serves it with hot reload on :3000 and forwards `/api` to
:8123. `/health` answers with the list of endpoints.

Writes (`POST`, `DELETE`) are accepted only from the dashboard's origin
(`http://localhost:3000`) or with no `Origin` header (the CLI, curl), so another
website open in your browser cannot change routing or install a skill through
localhost. Serve the dashboard from somewhere else and list it in
`GARRY_UI_ORIGINS` (comma separated).

### Phones and other computers

By default the server listens on `127.0.0.1`: only this machine can connect. To
use Garry from a phone or another computer, listen on an address they can reach
(the LAN address, a Tailscale address, or `0.0.0.0` for every network) and pair
each device once:

```bash
garry serve --host 0.0.0.0        # prints a pairing QR code at start
garry pair                        # a fresh code for the next device
garry devices                     # paired devices; garry devices revoke <id>
```

Scan the QR code with the Garry app, paste the link into Add server, or open it
in a browser on the other computer: the browser then keeps a session cookie
(HttpOnly, SameSite=Strict) instead of a token. A code
pairs one device, works once and expires after 10 minutes. The device gets its
own token and sends it with every request (`Authorization: Bearer <token>`, or
`?access_token=` on reads, for browser event streams). Requests from other
machines without a valid token get `401`.

- This machine needs no token. Pairing codes and the device list can only be
  managed from it, so a lost phone cannot pair more devices; revoke it with
  `garry devices revoke <id>`.
- Only a SHA-256 hash of each token is stored, in `~/.garry/devices.json`
  (`GARRY_HOME` moves it).
- The server answers only to `localhost` and the addresses it listens on, so a
  website that points its own domain at your machine (DNS rebinding) is refused.
- Traffic is plain HTTP, so keep it to networks you trust (home Wi-Fi, a VPN such
  as Tailscale). Do not forward the port to the internet. A reverse proxy on this
  machine would make every request look local, so do not put one in front of it.

## garry qa

Does a change need a person to try it before it ships? `garry qa` reads the diff
from `--base` (default `origin/main`) to `HEAD` and names what a human should
check, area by area:

| Area | When |
|---|---|
| Looks different | stylesheets, markup |
| Behaves differently | new or changed handlers, forms, buttons, navigation |
| Settings and configuration | `.env.example`, `app.json`, settings files, the routing, new environment variables |
| Sign in, pairing and permissions | auth, pairing, tokens, Face ID and Touch ID |
| iPhone app, Mac app | `garry-mobile`, `garry-desktop` |
| Saved data and formats | schemas, stores, migrations |

Tests, docs, CI and lockfiles need nobody. With `--pr <n> --repo owner/name` it
puts the **needs human QA** label on the pull request (or takes it off) and keeps
one comment with a badge and a checklist; the
[`qa.yml`](../.github/workflows/qa.yml) workflow runs it on every pull request,
and Garry adds the same section and label when it opens a pull request for a
thread. Rules: `garry-tool/src/review/qa.ts`.

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
pnpm garry shots capture --url http://localhost:8123 --out shots/head
```

Set `GARRY_CHROMIUM_PATH` to use an already installed Chromium.

## Configuration files

| File | Used by | |
|---|---|---|
| `garry.routing.json` | `feature`, `serve` | Garry's setup for the default routing profile; changes and your own are `routing/<name>.json` in the registry |
| `garry.screenshots.json` | `shots` | routes, viewports and themes to capture |
| `.env.local` (or `.env`) | every command | all variables, see `.env.example` |
| `~/.garry/skills/` | `skills`, `feature`, `serve` | locally installed skills |
| `garry-tool/skills/manifest.json` | `feature`, `serve` | the skills per stage |
| `<registry>/features/*.md` | `feature`, `ws`, `serve` | the features |
| `<registry>/catalog/*.yaml` | everything | the services |
