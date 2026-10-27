# React lint warnings walkthrough

Date: 2026-10-27
Area: components refactored to clear `react/refs` and `react/set-state-in-effect`
Branch: `t3/explain-lint-warnings`
Environment: isolated T3 worktree, `http://armin-f7920f4c57.localhost:19132`, local Convex deployment, sample account `test@example.com`.
Browser: agent-browser managed Chromium, session `task-0357f95a5f36`, desktop viewport. No mobile or real-device checks.

The branch removes every finding of the two rules ADR 0003 left as warnings,
then promotes both rules to errors. Most fixes move "copy a prop into state"
effects into render-time adjustments, move "latest value" ref writes into layout
effects or `useEffectEvent`, and move values shown on screen from refs to state.
Timing-sensitive checks (animation, first open frame) were sampled inside the
page with `requestAnimationFrame`, because the CLI round-trip is slower than
the animations.

## Toolchain checks

| Check | Result |
| --- | --- |
| `pnpm check` | Formatting clean, 0 lint warnings, 0 lint/type errors |
| `pnpm --filter @armin/web build` | Built |
| `pnpm --filter @armin/mobile check:bundle` | Android and iOS bundles exported |

## App checks

| Area (change) | Steps | Result |
| --- | --- | --- |
| Dialog (`dialog.tsx` opener and snapshot in state, derived `closing`) | Opened New deck, pressed Escape | Focus moved into the dialog and returned to "New deck"; `animate-pop-out` ran about 200 ms before unmount |
| Dialog close snapshot (ADR 0016) | Created "QA temp deck", deleted it | Through the exit, the content stayed "Create deck" with the typed name; the delete button went `Delete deck` → `Delete deck (aria-busy)` → gone, with no label change |
| Dialog opened from a menu | Deck actions → Rename deck, Escape | Name field focused with the deck name; focus returned to "Deck actions" |
| Card form (`flashcard-form-dialog.tsx` render-time hydrate, `useEffectEvent` Ctrl+Enter) | Add card with `\(x^2\)` in source, Ctrl+Enter | Card saved; create mode cleared the form and stayed open (existing behavior) |
| Card form discard guard | Typed a draft, Escape → Keep editing, Escape → Discard | Discard prompt focused "Keep editing"; keeping returned to the draft; discarding closed both dialogs. A clean form closed on Escape without a prompt |
| Card form edit with math | Opened the math card | The first frame with the field already held the card's TeX, in source mode (the earlier frames were the lazy form mounting); Escape closed without a false discard prompt; focus returned to the card |
| Deck settings (`scheduling-inputs.tsx` `useSyncedDraft`, `deck-settings-dialog.tsx`) | Retention 85, learning step 5 min, invalid entries, Reset all to inherited, Cancel | Edits committed; Reset all redrew retention 90 and step 10. Invalid fields revert to the last value and keep their red border until typed in, including after Reset when the stored value didn't change; same as before (the old effect also keyed on the value) |
| Move card (`move-flashcard-dialog.tsx` computed default) | Moved the math card to a new "QA target deck" | Destination defaulted to the only other deck; button showed busy without a label change; card left the source deck |
| Graph route (`deck.$deckId.graph.tsx` render-time sync) | Opened the graph, Fit view | All four cards and the prerequisite edge rendered |
| Graph search (`use-graph-search.ts`) | Searched "armin", Enter ×4, Shift+Enter, then "prerequisite", Enter, Clear search | Stepping wrapped 1→2→3→1 and back to 3. **Found a regression:** the new query showed "2 of 2" instead of resetting. Fixed (see below); after the fix the new query showed "2 matches · Enter to step through", Enter gave "1 of 2", and clearing removed the status |
| Link picker (`graph-link-picker.tsx` clear on open) | Add prerequisite…, filtered "schedules", Escape, reopened | Filter narrowed to one card; reopening showed an empty filter and all cards |
| Graph edits (`use-graph-canvas-edits.ts`) | Added a prerequisite through the picker, reloaded, removed it | Edge count 1 → 2, still 2 after reload, back to 1 after removal |
| Review session (`review-session.tsx` layout-effect refs, render-time resets) | Space to reveal, rated Good, Undo, switched deck to Agent sample library, typed answer "FSRS" | KaTeX rendered on the math card; the next card started unrevealed; Undo restored the math card face-down and the count to 4; switching deck started at 1 / 3 with Undo disabled; the typed answer showed "Correct" |
| Sidebar (`_app.tsx` optimistic highlight) | Clicked Review in the sidebar | Only "Review" marked current after navigation |
| Keybinding recorder (`keybinding-settings.tsx` render-time reset, `useEffectEvent`) | Go to Browse: Enter with nothing, Shift+X, Escape, reopen, Shift+X + Enter; pressed Shift+X; Reset all | Empty Enter showed "Press a key or chord to record first."; reopening cleared the draft; Enter saved "Shift X" (the listener saw the latest draft); Shift+X opened Browse; Reset all restored "G then B" |
| Image placeholders (`markdown-content.tsx` CSS counter) | Card with math and two uploaded images, viewed its deck tile | Placeholders read "[Image 1]" and "[Image 2]" (checked by screenshot with the tile's line clamp lifted, since generated content isn't in `innerText`) |
| Image zoom (`image-zoom-dialog.tsx` `dragging` state, render-time reset) | Preview image from the editor, Zoom in ×2, dragged, closed, reopened, Escape | Scale 1.44; mid-drag `transition: none` and translate (80, 40); after release the transition was restored; reopening reset to scale 1 at (0, 0); Escape closed only the preview |

Test decks and cards were deleted afterwards.

## Regression found and fixed

`use-graph-search.ts` made two render-time adjustments to the same `step`
state: reset it when the query changes, then clamp it to the match count. On the
render where the query changed, the reset queued `null`, but the clamp read the
old local `step` and queued a clamped number after it, which won. The old
effects didn't have the problem because the clamp used an updater function. The
clamp now runs only when the query hasn't just changed. Every other render-time
block in the branch writes a different piece of state.

## Not checked

The mobile study screen (`apps/mobile/src/App.tsx`, first card picked during
render) beyond the bundle check, and `useIsMobile` and the toast portal
(`useSyncExternalStore`) at a phone-width viewport.
