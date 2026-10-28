---
name: review-contract-compliance
description: Verifies that a pull request implements the contracts it touches exactly - event names and payloads, exposed remotes, shared dependency versions, API shapes and design tokens. Use it in the Review stage on every pull request of a service in the registry.
stage: review
---

# review-contract-compliance

## Purpose

Contracts are the shared truth between services; Garry changes them first and the
code follows. A pull request that drifts from its contract breaks another service
that was built against it, usually only at runtime. This skill catches that drift
in review.

## When to use

- Review stage, on every pull request of a service listed in the registry.
- Always when the diff touches events, remotes, shared dependencies, API routes or
  styling tokens.

## Input

- The pull request diff.
- The contract slice of this service in `.garry/contracts/` and the generated types in
  `.garry/` (written by `sync-contracts` and `generate-types`).
- The service manifest: what it exposes and what it consumes.

## Steps

1. Make sure the slice is current: compare it with the registry version named in
   `.garry/`. A stale slice is a finding (major); stop and ask for a sync.
2. Events: every event the code emits or listens to exists in the contract, with the
   same name, the same payload fields and types, and the right direction (this service
   produces what the contract says it produces, and consumes what it says it consumes).
3. Remotes: the module federation remotes the code exposes or loads match the manifest
   names and paths.
4. Shared dependencies: versions in `package.json` satisfy the ranges in the contract,
   and singletons stay singletons.
5. APIs: routes, methods, request and response shapes, status codes match the API
   contract. A removed or renamed field is breaking.
6. Design tokens: colors, spacing and radii come from the tokens, not from literals.
7. The code uses the generated types instead of hand written copies of them.

## Output

A review report in the shared format of `review-correctness`. Severity:

- blocker: a breaking mismatch, for example a payload field renamed, an event emitted
  that is not in the contract, a response field removed, a shared singleton bumped
  outside its range.
- major: a stale contract slice, hand written types that can drift.
- minor: a hard coded value where a token exists.

End with `verdict: block` when there is at least one blocker, otherwise
`verdict: pass`.

## Notes

When the code is right and the contract is out of date, the fix is a contract change
in the registry first (Design stage), never an edit of `.garry/` by hand. Say so in
the finding.
