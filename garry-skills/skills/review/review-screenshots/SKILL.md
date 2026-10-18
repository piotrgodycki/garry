---
name: review-screenshots
description: Attaches before and after screenshots of every changed view to a pull request when it goes to code review, by a human or by a review agent. Use it in the Review stage for any service with a user interface.
---

# review-screenshots

## Purpose

A reviewer should see what a change looks like before reading the diff. When a
pull request goes to review, this skill captures every configured view of the
base and of the head in headless Chromium, diffs them pixel by pixel and keeps
one comment on the pull request up to date with before, after and the diff.

## When to use

- Review stage, for every service with a UI (microfrontends, the shell, the
  Garry dashboard).
- When a pull request leaves draft, when a review is requested from a person or
  from a review agent, and on every push while it is in review.

## Input

- `garry.screenshots.json` in the repository root: the routes, viewports and
  themes to capture. Routes marked `live` stream data and are shown, not diffed.
- A running build of the base and of the head.

## Steps

1. `garry shots capture --url <head url> --out shots/head`
2. `garry shots capture --url <base url> --out shots/base` (the head's config,
   so both sides are captured the same way)
3. `garry shots compare --base shots/base --head shots/head --out shots/report`
4. Publish `shots/report` where the comment can load the images. In CI that is
   the orphan branch `garry-screenshots`, one folder per pull request.
5. `garry shots comment --report shots/report/report.json --repo <owner/name> --pr <n> --images-url <template>`

In this repository `.github/workflows/pr-screenshots.yml` runs all five steps.
For a service repository, copy that workflow and adapt the build and start
commands once the `garry` CLI is published.

## Output

- One pull request comment, edited in place on every push: changed views first
  with the share of pixels that changed, then new, removed and live views, then
  the list of unchanged views.
- The report directory as a workflow artifact for 14 days.

## Notes

Motion is frozen (reduced motion plus Playwright's animation freeze) and the
Next.js dev overlay is hidden, so two runs of the same code give the same
pixels. A view counts as changed past 0.05% of pixels. The screenshots are
removed from the orphan branch when the pull request closes.
