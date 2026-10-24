---
name: update-characters
description: Sync this fork with upstream and update Makan's owned roster and personal costs when asked to update characters or add new pulls.
---

In this repo, "update characters" means sync upstream. Include any supplied
ownership, sequence, and weapon changes in the same PR as the sync. If upstream
is already integrated, make only the requested roster and cost changes.

## Sync and roster changes

Start from the fork's current default branch; it is named `master`, not `main`.
Fetch `Riley31415/wuwa_calc` and merge any new upstream commits, preserving
upstream ancestry and this fork's personal costs, ownership filtering,
portraits, sequence labels, and build setup.

Update `OWNED_LIMITED_CHARACTERS` in `src/ownership.ts` and personal cost
exceptions in `src/costs.ts`, using the supplied pulls and existing character
names. Standards, four-stars, and Rovers are already owned automatically.

`S0R0` means sequence zero with no signature weapon. Use the existing defaults
where they already match; do not add redundant cost overrides. R0 is not a
weapon refinement of zero. Keep fixed weapon ranks and existing exceptions.
Bump `MAKAN_COST_REVISION` when personal cost behavior changes, not for
ownership-only additions.

## Validation

Run `npm run build` and `npm test`, adjusting relevant roster and cost coverage.
Refresh `dist/solves/` with `npm run precompute` after runtime changes: its stamp
hashes the browser bundles, so ownership changes also require a refresh.
Generated `dist/bundle/` files stay out of Git. Check portrait coverage when
upstream introduces characters.

