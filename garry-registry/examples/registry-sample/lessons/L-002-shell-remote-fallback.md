---
id: L-002
title: The shell loads every remote behind an error boundary
kind: practice
status: active
rule: >-
  In the shell, wrap each lazily loaded remote in an error boundary with a
  fallback, so one failing remote never blanks the whole page.
appliesTo:
  stages: [implement, review]
  services: [shell]
  skills: []
incidents:
  - feature: FEAT-123
    stage: review
    service: shell
    date: "2026-10-11"
    source: human
    summary: The cart preview remote failed to load and the header rendered nothing; the human asked for a fallback.
---

## What happened

A missing `checkout-mfe` remote entry took the whole shell header down.

## How to avoid it

Every `React.lazy` import of a remote sits inside an error boundary with a small
fallback that keeps the rest of the shell usable.
