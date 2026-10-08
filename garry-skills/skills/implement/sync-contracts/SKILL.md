---
name: sync-contracts
description: Injects the slice of contracts a service may rely on from the Contract Registry into the service repository under .garry/contracts/. Use it in the Implement stage, and re-run it whenever the registry version changes.
---

# sync-contracts

## Purpose

Give a service agent the context it needs about the rest of the system without
access to any other repository. Only the slice this service may rely on is copied
in, so the agent sees contracts, never implementations.

## When to use

- Implement stage, right after scaffolding.
- Whenever the registry version changes (a contract was updated).

## Input

- The service name and the registry root. In a scaffolded repository both are read
  from `.garry/service.json`.

## Steps

1. Read the service manifest from `catalog/<service>.yaml`.
2. Read the contracts from `contracts/`.
3. Compute the slice:
   - remotes: only the services this one consumes,
   - shared dependencies and design tokens: the full contract (they are global),
   - events: only those where this service is a producer or a consumer.
4. Write the slice into `.garry/contracts/` in the repository.

## Output

- `.garry/contracts/` populated with the service specific slice.

## Reference implementation

```bash
garry sync --repo <dir> --service <name> --registry <path>
```

Inside a scaffolded repository just run `garry sync`. It pairs with
`generate-types`, which turns the slice into TypeScript types.
