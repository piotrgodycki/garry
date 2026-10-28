---
name: api-contract
description: Updates the backend API contract in the registry (OpenAPI for REST, AsyncAPI for events) in contracts/api.json, the backend equivalent of the Module Federation remotes contract. Use it in the Design stage for backend services, contract first.
---

# api-contract

## Purpose

For backend services the cross service contract is the API, not Module Federation.
This skill keeps `contracts/api.json` in the registry as the single source of truth
for what each service exposes over REST (OpenAPI) or events (AsyncAPI).

## When to use

- Design stage, for any backend feature that adds or changes an operation.

## Steps

1. Read the impact report to see which services and operations are affected.
2. Update the producing service entry in `contracts/api.json`:
   its `kind` (openapi or asyncapi), `baseUrl` and the list of `operations`.
3. Keep the manifest `api` reference in sync (path and version).
4. Hand off to `contract-validate`, then bump the registry version.

## Output

- An updated `contracts/api.json` and manifest `api` reference.

## Notes

Contract first: the API contract changes in the registry before any service code.
Consumers then regenerate against the new contract during Implement.
