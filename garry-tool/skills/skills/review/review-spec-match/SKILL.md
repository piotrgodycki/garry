---
name: review-spec-match
description: Checks a pull request against the feature's acceptance criteria - every criterion met and tested, nothing built that the spec did not ask for. Use it in the Review stage on pull requests that belong to a feature.
stage: review
---

# review-spec-match

## Purpose

The code can be correct and still be the wrong thing. This skill checks that the
pull request delivers what the feature asked for: every acceptance criterion, for
this service, and nothing that nobody asked for.

## When to use

- Review stage, on every pull request opened for a feature (branch `feat/FEAT-x`).
- Skip it, and say so in the report, for pull requests with no feature.

## Input

- The pull request diff.
- The feature file `features/FEAT-x.md` from the registry: its acceptance criteria and
  the services it lists. In a service repository the synced copy is under `.garry/`.

## Steps

1. Find the feature id from the branch name or the pull request description, and read
   its acceptance criteria.
2. Keep only the criteria that concern this service (the feature lists which services
   do what).
3. For each criterion, find the code that delivers it and the test that proves it.
   Write a line per criterion: met and tested, met but untested, partly met, or
   missing.
4. List the changes that no criterion asks for. Scope creep is a finding (minor), or
   major when it changes behaviour other services rely on.
5. Check user facing text, error messages and empty states against the spec wording.

## Output

A review report in the shared format of `review-correctness`, plus a criteria table:

```
| Criterion | State | Where |
| --- | --- | --- |
| Adding an item updates the cart count | met, tested | CartSummary.tsx:40, cart.test.ts:12 |
```

Severity:

- blocker: a criterion for this service is missing.
- major: a criterion is partly met, or met without a test.
- minor: unrequested scope, wording that differs from the spec.

End with `verdict: block` when any criterion is missing, otherwise `verdict: pass`.

## Notes

The spec wins over the code. When the spec itself looks wrong, report it as a
question for the human instead of judging the code against your own idea.
