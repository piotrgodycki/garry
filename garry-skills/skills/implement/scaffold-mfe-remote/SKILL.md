---
name: scaffold-mfe-remote
description: Creates a microfrontend remote on Vite with the Module Federation 2.0 runtime, exposing modules, writes AGENTS.md and registers the service in the registry catalog. Use it in the Implement stage when a new remote is needed.
---

# scaffold-mfe-remote

## Purpose

Create a new remote: a microfrontend that exposes modules for the host and for
other remotes to consume. The exposed modules become part of the contract in the
registry.

## When to use

- Implement stage, when the plan calls for a new remote service.

## Input

- The service name and owner.
- The registry root that holds `catalog/`.
- The output directory for the new repository.

## Steps

1. Render the Vite remote template with the Module Federation 2.0 runtime
   (`exposes` starts with a sample `./App`, extended later by `mf-wiring`).
2. Write `AGENTS.md`, a minimal exposed component and the `.garry/` placeholder.
3. Write the service manifest into `catalog/<name>.yaml` with the structured
   stack fields (`framework`, `bundler`, `federation`) and the exposed modules.

## Output

- A new remote repository on disk.
- A catalog entry in the registry, including the exposed modules.

## Reference implementation

```bash
garry scaffold <name> --kind remote --owner <team> --registry <path> --out <dir>
```

The CLI runs an interactive wizard in a terminal, or headless when the options
above are passed. After scaffolding, run `garry sync` to inject contracts.
