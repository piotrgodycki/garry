---
id: L-001
title: Event payload fields follow events.json exactly
kind: mistake
status: active
rule: >-
  Copy event payload field names from .garry/contracts/events.json and use the
  generated types; never retype or rename a field (sku, not productId).
appliesTo:
  stages: [implement, review]
  services: []
  skills: [generate-types, review-contract-compliance]
incidents:
  - feature: FEAT-123
    stage: test
    service: search-mfe
    date: "2026-10-09"
    source: drift
    summary: search-mfe emitted cart:item-added with productId instead of sku; drift-check failed.
  - feature: FEAT-123
    stage: review
    service: checkout-mfe
    date: "2026-10-10"
    source: review
    summary: checkout-mfe read payload.qty while the contract defines quantity.
---

## What happened

Two services hand wrote the `cart:item-added` payload instead of importing the
generated type, and each picked a different field name than the contract.

## Why

The implement agent read the feature document, not `.garry/contracts/events.json`,
and the generated types were not imported.

## How to avoid it

Import the payload type from `.garry/types/contracts.d.ts`. The reviewer checks
every emitted and consumed event against the contract slice.
