---
name: review-correctness
description: Reviews a pull request for bugs - wrong logic, unhandled edge cases and errors, broken callers, races and resource leaks. Use it in the Review stage on every pull request, before the other review skills.
stage: review
---

# review-correctness

## Purpose

Find the changes that make the code do the wrong thing. Not style, not taste:
a finding here is a concrete input or state that leads to a wrong result, a
crash, lost data or a hang.

## When to use

- Review stage, on every pull request, first among the review skills.
- Again on every push while the pull request is in review (review only what changed
  since the last review, and re-check findings that are still open).

## Input

- The pull request diff and the full files it touches.
- The callers of every changed function, type or endpoint (search the repository).

## Steps

1. Read the description and the diff once to learn the intent.
2. For each changed function, walk through:
   - empty, missing, zero, negative, very large and duplicate inputs;
   - the error paths: what happens when a call it makes fails or times out;
   - async ordering: awaited promises, concurrent calls, retries, cancellation;
   - resources: files, sockets, timers and listeners opened and never closed.
3. For each changed signature, type or return value, open every caller and check that
   it still holds. A caller left behind is a bug even if this file looks right.
4. Check that the new code matches what the comments and names around it promise.
5. Check that tests cover the change. A behaviour change with no test is a finding
   (major), a test that cannot fail is a finding (minor).
6. Write every finding in the report format below. Before keeping one, trace the path
   from a real caller or input to the failure. Drop it if you cannot.

## Output

A review report (see "Report format"), one entry per finding.

## Report format

Shared by every review skill, so the reports merge into one review:

```
- severity: blocker | major | minor | nit
  file: path/to/file.ts
  line: 42
  finding: one sentence, what is wrong
  why: the input or state that triggers it and what happens then
  fix: the smallest change that fixes it
```

- blocker: wrong result, crash, data loss or security issue on a realistic path.
  The pull request must not merge with it.
- major: likely bug or missing test for a behaviour change. Fix before merge.
- minor: real but unlikely, or limited impact. Fix if cheap.
- nit: wording or readability. Never blocks.

End the report with `verdict: block` when there is at least one blocker,
otherwise `verdict: pass`.

## Notes

Report what you verified, not what you suspect. One precise finding is worth more
than five vague ones. Praise is not a finding.
