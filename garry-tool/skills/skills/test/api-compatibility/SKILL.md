---
name: api-compatibility
description: Checks a backend service implementation against the API contract (OpenAPI or AsyncAPI) in the registry, the backend equivalent of contract compliance for microfrontends. Use it in the Test stage for backend services.
---

# api-compatibility

## Purpose

Confirm that a backend service still honors the API contract it declares in the
registry: the operations, their shapes and the events it produces or consumes.
This is the backend counterpart of `drift-check` for microfrontend contracts.

## When to use

- Test stage, for any backend service that declares an `api` contract.

## Input

- The service repository and `contracts/api.json`.

## Steps

1. Read the declared `operations` for the service from `contracts/api.json`.
2. Compare them against the implemented routes or event handlers.
3. Flag any operation that is declared but missing, or implemented but undeclared.

## Output

- A report of matches and mismatches. A mismatch blocks integration.

## Notes

Like contract compliance for microfrontends, this keeps the registry contract and
the running code from drifting apart.
