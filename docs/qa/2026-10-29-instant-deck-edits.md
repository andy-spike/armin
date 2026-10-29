# Instant deck edits walkthrough

Date: 2026-10-29
Checkout: `claude/manual-ui-polish` (`.claude/worktrees/armin-integrations-9e908c`)
Environment: this worktree's web app at `http://armin-b69218dd35.localhost:19808`,
headless Chromium through agent-browser with software rendering, seed account.
Times are from the button click to the sidebar's DOM changing.

## Why

A Convex mutation resolves, and its result reaches the page, only once every
open query it affects has recomputed. On this library that took 2–4 seconds
after any deck change. Splitting `decks.list` into a summary query and a
due-count query was tried and reverted: Convex delivers all affected queries in
one update, so the fast half still waited for the slow ones.

## What changed

- Heavy queries (deck stats, review and cram queues, browse, stats, graph)
  close 30 seconds after their last reader instead of 5 minutes, so fewer of
  them rerun per change. A pin's update arrived in about 2.1s instead of 3–4s
  once the background review queue had closed.
- Rename, delete, and create apply on click through `lib/pending-deck-edits.ts`
  and close their dialog; a failure restores the list and shows an error toast.
  A new deck shows as a dimmed, inert placeholder until the real one arrives.

## Steps

1. New deck "QA temp deck": a dimmed placeholder appeared in the sidebar after
   about 380ms; the real deck replaced it about 4 seconds later with no
   duplicate row.
2. Renamed it from the sidebar menu: the new name showed after about 480ms,
   the dialog closed, and the name never flipped back.
3. Deleted it from the sidebar menu: the row disappeared after about 450ms and
   did not return. Repeated create and delete with "QA temp deck 2". The
   database has no "QA temp" decks afterwards.
4. `pnpm check` and `pnpm --filter @armin/web build` pass.

## Not exercised

- A failing rename, delete, or create (the rollback path).
- The Decks page grid during these edits (it reads the same pending store).
- A real device or a visible desktop browser.
