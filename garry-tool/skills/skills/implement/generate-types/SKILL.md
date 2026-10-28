---
name: generate-types
description: Generates TypeScript types from the contract slice in .garry/contracts/ into .garry/types/, so a service imports typed events, remote modules and shared dependency names. Runs as part of garry sync, after sync-contracts.
---

# generate-types

## Purpose

Turn the contract slice into TypeScript types, so the service codes against the
contract with full type safety instead of loose strings.

## When to use

- Implement stage, right after `sync-contracts` (both run inside `garry sync`).

## Input

- The contract slice in `.garry/contracts/` and the service manifest.

## Steps

1. Read the slice (remotes, shared dependencies, design tokens, events).
2. Generate `.garry/types/contracts.d.ts`:
   - `GarryEvents`: a map from event name to its payload shape.
   - `RemoteModule`: a union of the modules this service may import, from consumes.
   - `SharedDepName`: a union of the shared dependency names.

## Output

- `.garry/types/contracts.d.ts`, regenerated on every sync.

## Reference implementation

Part of `garry sync`. The generator reads the slice written by `sync-contracts`
and emits one declaration file. It never edits the file by hand, so a re-sync
always reflects the current contract.
