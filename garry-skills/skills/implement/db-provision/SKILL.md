---
name: db-provision
description: Provisions a per service database from the manifest db config (engine, name), so each backend service owns its own data. Use it in the Implement stage when a backend service is first set up or its database changes.
---

# db-provision

## Purpose

Each backend service owns its own database (no shared database between services).
This skill provisions that database from the `db` block in the service manifest.

## When to use

- Implement stage, when a backend service is scaffolded or its `db` config changes.

## Input

- The service manifest `db` block: `engine`, `name` and the `migrations` directory.

## Steps

1. Read `db` from `catalog/<service>.yaml`.
2. Create the database for the declared engine if it does not exist.
3. Record the connection for the service (through the environment, never committed).
4. Hand off to `db-migrate` to bring the schema up to date.

## Output

- A provisioned, empty database ready for migrations.

## Notes

Credentials live in the environment only, never in the registry or a commit.
