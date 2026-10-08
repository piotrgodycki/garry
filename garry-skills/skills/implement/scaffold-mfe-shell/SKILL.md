---
name: scaffold-mfe-shell
description: Creates a microfrontend shell host (the container app) on Vite with the Module Federation 2.0 runtime, writes AGENTS.md and registers the service in the registry catalog. Use it in the Implement stage when a new host is needed.
---

# scaffold-mfe-shell

## Purpose

Create a new shell host: the container application that consumes remotes. The
host owns the app shell, routing and shared context, and loads remotes declared
in the registry.

## When to use

- Implement stage, when the plan calls for a new host service.

## Input

- The service name and owner.
- The registry root that holds `catalog/`.
- The output directory for the new repository.

## Steps

1. Render the Vite host template with the Module Federation 2.0 runtime
   (`remotes` start empty and are reconciled later by `mf-wiring`).
2. Write `AGENTS.md`, a minimal app shell and the `.garry/` placeholder.
3. Write the service manifest into `catalog/<name>.yaml` with the structured
   stack fields (`framework`, `bundler`, `federation`).

## Output

- A new host repository on disk.
- A catalog entry in the registry.

## Reference implementation

```bash
garry scaffold <name> --kind shell --owner <team> --registry <path> --out <dir>
```

The CLI runs an interactive wizard in a terminal, or headless when the options
above are passed. After scaffolding, run `garry sync` to inject contracts.
