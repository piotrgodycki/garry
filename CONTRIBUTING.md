# Contributing to Garry

Thanks for helping. Garry is a supervisor agent that drives features through the
AI SDLC, so changes here shape how other people's agents behave. Small, focused
pull requests with a clear reason are the easiest to review.

## Before you start

- Read [ARCHITECTURE.md](./ARCHITECTURE.md). The two rules that shape everything:
  contract first (nothing touches code before the contract in the registry is
  updated and validated) and one responsibility per skill.
- For anything larger than a bug fix, open an issue first so we can agree on the
  approach before you write the code.
- Security issues never go into a public issue. See [SECURITY.md](./SECURITY.md).

## Set up

You need Node 22 and pnpm 10. This repository uses pnpm only.

```bash
pnpm install
pnpm dev          # server on :8123, UI on :3000
```

## Checks to run before a pull request

These are the same checks CI runs:

```bash
pnpm -C garry-registry typecheck
pnpm -C garry-skills typecheck
pnpm -C garry-tool typecheck
pnpm -C garry-registry exec tsx src/cli.ts examples/registry-sample
pnpm -C garry-registry exec tsx src/cli.ts examples/backend-sample
pnpm -C garry-skills validate
pnpm dashcheck
```

## Conventions

- English only, with plain ASCII punctuation. No em dashes, en dashes or other
  typographic dashes; `pnpm dashcheck` fails the build if it finds one.
- TypeScript strict. Prefer the platform (`node:http`, native HTML elements) over a
  new dependency. A new dependency needs a reason in the pull request.
- A new skill gets an entry in `garry-skills/manifest.json` and a `SKILL.md` with a
  `name` and `description` frontmatter. One skill, one responsibility.
- A registry format change gets a zod schema in `garry-registry/src/schema.ts`, a
  check in `validate.ts` and an example in `examples/`.
- Never commit secrets. Tokens live in `.env`, which is ignored.

## Pull requests

- Describe what changed and why, and how you tested it.
- Keep each pull request to one concern.
- CI must be green: validate, dash guard and the security review.

## License

By contributing you agree that your contribution is licensed under the
[Apache License 2.0](./LICENSE), the same license as the project.
