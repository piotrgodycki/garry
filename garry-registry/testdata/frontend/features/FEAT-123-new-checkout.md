---
id: FEAT-123
title: New checkout flow with a quick cart
status: design
services: [shell, checkout-mfe, search-mfe]
contractChanges: [events.json]
routingOverride:
  review: { agent: garry-reviewer, model: claude-opus-4-8 }
---

## Goal

Allow a product to be added to the cart directly from the search results, with
an immediate cart preview in the shell.

## Dependency graph

```
events.json (cart:item-added)
   |-> checkout-mfe   (consumes the event, renders CartSummary)
   |-> search-mfe     (produces the event from ProductCard)
          |-> shell   (cart preview in the header)
```

Delegation order: the contract first (events.json), then search-mfe and
checkout-mfe in parallel, and finally shell.

## Stage state

- [x] spec
- [x] plan
- [ ] design (in progress, changing events.json)
- [ ] implement
- [ ] review
- [ ] test
- [ ] integrate

## Notes

- Changing the cart:item-added contract requires a @garry/registry version bump.
- After all pull requests are merged, tag the versions and run changelog.
