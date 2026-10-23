# Simplification walkthrough: prerequisite graph and card form

Date: 2026-10-22
Area: `/deck/<id>/graph` canvas, link picker, and the card form dialog
Branch: `t3/simplify-graph-and-card-form`
Environment: isolated T3 worktree, `http://armin-4ab8299a2a.localhost:37236`, local Convex deployment, sample account `test@example.com`.
Browser: agent-browser managed Chromium, session `simplify-check`, desktop viewport. No mobile or real-device checks.

This branch only restructures code. It splits `prerequisite-graph.tsx` and
`flashcard-form-dialog.tsx` into smaller files and hooks, shares one link rule
(`linkProblem`), keeps the card form's fields in one state object, and removes
the graph's unused direct card-delete path. The walkthrough checks that
behavior is unchanged.

## Setup

A new deck "Simplify check" with a chain Alpha → Beta → Gamma and a standalone
card Delta, created through the app client. None of the cards had a saved
position.

## Checks

| Area (moved code)                                  | Steps                                                                                            | Result                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Background layout (`useBackgroundLayout`)          | Opened the graph with unpositioned cards                                                         | All four cards were placed and their positions saved (x 0, y 0/188/376/556)                                                          |
| Canvas                                             | Loaded graph                                                                                     | Links, minimap, and zoom control rendered                                                                                            |
| Zoom (`ZoomControl`)                               | Zoom out                                                                                         | 100% → 83%                                                                                                                           |
| Search (`useGraphSearch`, `GraphToolbar`)          | Searched "card", Enter, Shift+Enter, "Gamma", "zzzz", Clear                                      | "4 matches", "1 of 4", wrap to "4 of 4", 1 match with others dimmed to 0.35, "No cards match", status removed after clear            |
| Context menu (plain builder)                       | Right-clicked Gamma, then Delta with no prerequisites                                            | Gamma: Edit, Add prerequisite, Add dependent, Remove prerequisite, Delete. Delta: no Remove prerequisite item, as on `master`        |
| Link picker and `linkProblem`                      | Gamma → Add dependent…                                                                           | Only Delta offered; Alpha and Beta, which would create a cycle, were left out. Picking Delta saved Gamma → Delta                     |
| Edge saving (`applyEdgeChange`)                    | Delta → Remove prerequisite… → Gamma                                                             | Picker listed Gamma; the link was removed on the server                                                                              |
| Card form edit (single field state)                | Edited Beta: appended to the back, switched to Type answer and back to Basic, saved              | Fields prefilled; text kept through the type switch; saved back "Beta card back plus"                                                |
| Unsaved changes                                    | Edited a card's back, pressed Escape                                                             | "Keep editing / Discard changes" prompt appeared                                                                                     |
| Card form create                                   | Double-clicked the empty canvas, chose Type answer, filled the prompt and then the answer        | Add card stayed disabled until both fields were set; the card saved as a type-answer card at the double-click position               |

The matched card in the "Gamma" search showed opacity 0.65, not 1. That is the
locked-card style (`opacity-65`): Gamma depends on unlearned Beta. It is not a
dimming error.

No errors appeared in the browser console during the walkthrough.

## Validation

`pnpm typecheck`, `pnpm lint`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` pass.
