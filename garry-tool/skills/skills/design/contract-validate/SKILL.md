---
name: contract-validate
description: Validates the contracts in the registry, both the schema (zod) and cross service consistency (consumes, exposes, remotes, events). Run it in the Design stage after every contract change, and in the Test stage as part of garry doctor.
---

# contract-validate

## Purpose

Confirm that the Contract Registry is consistent before anyone touches code
(the contract first principle). This is the quality gate of the Design stage
and a part of garry doctor.

## When to use

- Design: after every change in `catalog/` or `contracts/`.
- Test: as part of `drift-check` and `garry doctor`.

## Input

- The path to the registry directory. It must contain `catalog/` and `contracts/`.

## Steps

1. Validate every manifest in `catalog/*.yaml` against `ServiceManifestSchema`.
2. Validate the contracts in `contracts/` against their matching schemas
   (`remotes.json`, `shared-deps.json`, `design-tokens.json`, `events.json`).
3. Check cross service consistency:
   - every `consumes[X]` references a service `X` that exists in `catalog/`,
   - the consumed modules are actually present in the `exposes` of service `X`,
   - `remotes.json` agrees with the `exposes` in the matching manifest,
   - the producers and consumers of events exist in `catalog/`.
4. Return a list of issues with the levels `error` and `warn`.

## Output

- `error` blocks the pipeline. The Implement stage must not start.
- `warn` is reported but does not block (for example a remote without a manifest).

## Reference implementation

The logic lives in garry (`garry-tool/src/registry/schema/validate.ts`):

```ts
import { validateRegistry, hasErrors } from "./registry/schema/validate.js";

const issues = validateRegistry(registryRoot);
if (hasErrors(issues)) throw new Error("The contract is inconsistent, Design is blocked");
```

The skill is a thin wrapper: the subagent calls `validateRegistry`, formats the
result and reports it to the supervisor, which decides whether to move on.
