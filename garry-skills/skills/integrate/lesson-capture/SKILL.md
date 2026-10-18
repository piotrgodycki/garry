---
name: lesson-capture
description: Records what went wrong as a project lesson in the registry (lessons/), so the same mistake is not made again. Run it whenever a review finding, a failed test, a red CI run, a drift-check failure or a human correction shows that Garry got something wrong, and once more as a retrospective at the end of Integrate.
---

# lesson-capture

## Purpose

Garry learns in every project. Each mistake becomes a lesson in the project's
registry, next to the feature state, and the supervisor injects the matching
lessons into every later task (the plan and `.garry/lessons.md`). A lesson outlives
the agent and the session that made the mistake.

## When to use

- Review: a reviewer finding that the author had to fix.
- Test: a failing unit, end to end or `drift-check` run caused by the change.
- CI: a red check on the feature branch caused by the change.
- Human: the human corrects Garry or rejects a result.
- Integrate: a retrospective over the whole feature, to catch anything missed.

Do not record flakes, infrastructure outages or failures that are not caused by
the change. A lesson is about what Garry did, not about the weather.

## Input

- The evidence: the finding, the failing output or the human's words.
- The feature id, the stage where it was caught and the service, if any.
- The existing lessons: `garry lessons --registry <registry>`.

## Steps

1. Find the root cause, not the symptom. "The test failed" is a symptom; "the
   payload field was retyped instead of taken from the contract" is a cause.
2. Check the existing lessons. If one already covers this cause, add an incident
   to it instead of writing a new one:
   `garry lessons add --id L-001 --feature FEAT-123 --stage test --service search-mfe --source drift --summary "..."`
3. Otherwise write a new lesson with one rule that would have prevented it:
   `garry lessons add --title "..." --rule "..." --stages implement,review --services search-mfe --feature FEAT-123 --stage test --source drift --summary "..."`
   - The rule is an instruction an agent can follow, in one or two sentences.
   - Scope it as narrowly as the cause: the stages, services and skills where it
     applies. Leave a list empty only when the rule really applies everywhere.
   - Use `--kind practice` for a convention the human taught, not an error.
4. Fill in the lesson body: what happened, why, and how to avoid it.
5. Run `contract-validate` (it validates `lessons/` too) and `garry sync` for the
   affected services, so `.garry/lessons.md` is current.

## Output

- A new or updated `lessons/L-xxx-*.md` in the registry.
- A lesson with two or more incidents is recurring. `garry lessons` lists it as a
  candidate for promotion into `@garry/skills`, where every project gets it. The
  human approves a promotion; it is never automatic.

## Retiring a lesson

When a rule no longer applies (the contract or the stack changed), set
`status: retired` in its frontmatter. Retired lessons stay in the history and are
no longer injected. A new incident on a retired lesson makes it active again.
