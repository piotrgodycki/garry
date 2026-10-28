---
name: db-migrate
description: Runs the per service database migrations from the repo migrations directory against the provisioned database. Use it in the Implement stage after db-provision, and whenever a feature adds migrations.
---

# db-migrate

## Purpose

Bring a backend service's database schema up to date by running its migrations, as
part of the same contract first flow: the schema change ships with the service.

## When to use

- Implement stage, after `db-provision`, and whenever a feature adds migrations.

## Input

- The provisioned database and the migrations directory (`db.migrations`).

## Steps

1. Read `db.migrations` from the manifest and the migration files in the repo.
2. Apply pending migrations in order against the service database.
3. Report the applied set and the resulting schema version.

## Output

- A migrated database and the schema version.

## Notes

Migrations are forward only in the pipeline. A failed migration blocks the service
Implement stage, the same way a failing contract blocks Design.
