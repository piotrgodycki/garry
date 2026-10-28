# Copilot instructions for Garry

These rules apply to every Copilot code review and suggestion in this repository.

## Language and style

- English only, in code, comments, documentation, commit messages and pull requests.
- Plain ASCII punctuation only. Never use an em dash, en dash, figure dash or horizontal bar. Use colons, parentheses or separate sentences instead. CI fails the build on any forbidden dash, so flag them in review.
- Write clearly and describe things well.

## Architecture rules

- Contract first. Nothing in a service repository should break the contracts defined in the registry (schemas in `garry-tool/src/registry/schema`). Flag code that bypasses the registry or reads another service's internals directly.
- The supervisor is headless. The CLI and the UI are thin layers over it. Flag duplicated orchestration logic.
- Skills are atomic (one responsibility). Flag skills that mix concerns.

## Security

- Never parse untrusted input with an engine that can execute code. In particular do not reintroduce `gray-matter` for SKILL.md: parse frontmatter as YAML only.
- Validate and contain file paths that come from manifests or user input (no path traversal outside the repository).
- Never commit secrets. Tokens live in `.env` only. Flag hardcoded credentials.
- Keep dependencies minimal and prefer well known packages. Flag new dependencies that are not justified.

## Tests and validation

- Changes to the registry schemas or the skills must keep `pnpm -C garry-tool typecheck`, `check:registry` and `check:skills` green.
