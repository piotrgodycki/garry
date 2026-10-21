<p align="center">
  <img src="https://raw.githubusercontent.com/piotrgodycki/garry/main/assets/garry-logo.svg" alt="Garry logo" width="300" height="88" />
</p>

# garry

Garry is a single supervisor agent that a human talks to. It drives each feature
through the full AI software development lifecycle (spec, plan, design, implement,
review, test, integrate) and delegates every stage to specialized agents, one per
repository, while a Contract Registry keeps the services aware of each other.

This package is the `garry` CLI and its HTTP server. Source, dashboard and docs:
[github.com/piotrgodycki/garry](https://github.com/piotrgodycki/garry).

## Install

Node 22 or newer.

```bash
npx garry --help        # run without installing
npm install -g garry    # or install the garry command
```

## Try it

```bash
garry feature FEAT-123   # plan a sample feature across three microfrontends (dry run)
garry skills list        # the pre-installed skills and their security audit
garry serve              # REST and SSE server on http://localhost:8123
```

With no `./registry` folder, garry copies the bundled sample registry to
`~/.garry/sample-registry` and uses it; pass `--registry <path>` for your own.

## Commands

| Command | What it does |
|---|---|
| `garry feature <id>` | compose a feature's pipeline: stages, skills, agents, models, delegation order |
| `garry ws` | check out every service of a feature as git worktrees, sync contracts, open pull requests |
| `garry scaffold` | create a new microfrontend service (interactive wizard) |
| `garry adopt <repo>` | reverse engineer a registry entry from an existing repository |
| `garry sync` | put a service's contract slice and generated types into its `.garry/` folder |
| `garry skills` | list, audit, install, remove or propose skills |
| `garry serve` | the server the dashboard talks to |
| `garry shots` | screenshots for code review (needs `playwright`) |

Every command has `--help`. The full reference is
[docs/cli.md](https://github.com/piotrgodycki/garry/blob/main/docs/cli.md), and how
the stages fit together is in
[docs/sdlc.md](https://github.com/piotrgodycki/garry/blob/main/docs/sdlc.md).

## Status

Garry composes the full pipeline today; the agents do not call a model yet, so
`garry feature` is a dry run. The executor on the Claude Agent SDK is the next phase.

Every release is published from CI with npm provenance.

## License

MIT
