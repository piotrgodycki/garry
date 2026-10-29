# The garry CLI, continued

The first half, with how to run it and every command at a glance, is [cli.md](./cli.md).

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
garry project remove shop-v2                 # its registry folder goes; repositories stay on disk
```

Any project can be removed, the default and the active one too, as long as one
is left: removing the active one makes another active (the default first). Its
repositories leave Build and stay on disk; a project with agents at work is
kept until they are stopped. In the dashboard, Remove asks first and says what
goes and what stays.

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

## garry hooks

Agents read whole files; past about 5,000 tokens they skim and edit the wrong
place. `garry hooks check` refuses staged files over that size (tokens counted
as bytes / 4) and prints, for each one, how to split it by kind (components,
modules, styles, docs, data). Lockfiles, generated code (dist/, `@generated`,
`DO NOT EDIT`, `linguist-generated` in .gitattributes) and binaries are skipped.

```bash
garry hooks check              # what the pre-commit hook runs
garry hooks check --max 8000   # another limit
garry hooks install            # add it to this repository's pre-commit hook (an existing hook runs first)
```

Garry runs the same check before it commits an agent's work in Build; each
project sets its own limit (Build, the project's settings; 0 turns it off).
