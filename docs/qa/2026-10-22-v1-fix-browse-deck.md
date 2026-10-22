# V1 QA fixes — Browse, deck detail, card tiles, deck counts

Date: 2026-10-22
Branch: `t3/fix-browse-deck-qa-findings`
Environment: isolated T3 worktree deployment, `http://armin-ba91e59e5a.localhost:18180`
Browser: agent-browser managed Chromium on desktop Linux, default 1280 × 577 CSS px viewport. Viewports are emulated; no real phones, Firefox, or Safari were used.

## Result

All six reported issues are fixed in the browser walkthrough. No automated suites were added, per the project decision.

| Issue | Result |
| --- | --- |
| 1. Archived cards counted inconsistently | Fixed |
| 2. HTML-looking text double-escaped in tiles | Fixed |
| 3. Browse has no text search | Fixed |
| 4. Removed tags stay in the Browse tag filter | Fixed |
| 5. Graph/Review button nested inside a link | Fixed |
| 6. Duplicate deck names in deck filter options | Fixed |

## Issue 1 — Archived cards counted inconsistently

**Repro.** Archived one card in `Agent sample library`. The deck header said `4 flashcards` while the grid footer said `5 flashcards`, and the archived tile remained listed with an `Archived` badge.

**Root cause.** The header used `deck.total` from `decks.deckStats`, which counts distinct flashcards with non-archived review units. The grid footer used `filteredTotal` from `flashcards.browse`, which counted every matching flashcard including archived ones. Two different queries produced two different totals.

**Change.**

- `packages/backend/convex/decks.ts`: `deckStats` now returns `archived`, the number of distinct archived flashcards behind the deck.
- `packages/backend/convex/flashcards.ts`: `browse` now returns `filteredArchived` and `libraryArchived` alongside the existing totals.
- `apps/web/src/lib/browse.ts`: added one `formatCardCounts(active, archived)` rule, e.g. `4 flashcards · 1 archived`.
- Deck header, deck grid footer, and Browse footer use that rule. Home and the sidebar already use `deck.total`, so they agree with the active headline. Progress stays `learned / total` over non-archived cards.
- `apps/web/src/lib/armin-client.ts`: the empty-Browse fallback returns the new count fields.
- An archived-only deck now keeps its card grid visible and reads `0 flashcards · 1 archived` instead of hiding the archived card behind the "No flashcards" empty state.

**Verification.** [deck counts](screenshots/deck-counts-archived.png) shows `4 flashcards · 1 archived` in both the header and the grid footer. [Archived-only deck](screenshots/deck-archived-only.png) shows `0 flashcards · 1 archived` with the archived tile still listed. Home shows `4 flashcards` for the same deck, matching the active headline.

## Issue 2 — HTML-looking text double-escaped in tiles

**Repro.** Created a basic card with front `<script>window.__xss=1</script> literal HTML test`. Browse and the deck tile showed `&lt;script&gt;window.\_\_xss=1&lt;/script&gt; …` while the editor showed the original characters.

**Root cause.** The Markdown editor serializes literal HTML as entities (`&lt;script&gt;`) and escapes Markdown syntax with backslashes (`\_\_`). Stored content contains those escapes by design. Tile previews rendered the raw source, so the entities and backslashes were visible. The old preview stripper also removed every `_`, which mangled names such as `__xss`.

**Change.** `apps/web/src/lib/markdown-preview.ts` now decodes one level of HTML entities, unescapes Markdown backslash escapes, and only removes paired emphasis markers. The tile edit button's accessible name uses the same decoded preview. The text is still rendered as a React text node, so `<script>` is never parsed as HTML.

**Verification.** The card tile shows `<script>window.__xss=1</script> literal HTML test` and `Back shows <b>bold</b> and &lt;entities&gt; too.` in [deck counts](screenshots/deck-counts-archived.png). A page evaluation after the fix returned `scriptTags: 0`, `window.__xss === undefined`, and the literal text in both tile paragraphs. The accessible button name is now `View and edit flashcard: <script>window.__xss=1</script> literal HTML test` rather than the escaped source.

## Issue 3 — Browse text search

**Root cause.** `flashcards.browse` already accepted an optional server-side `search` filter (front, back, tags), but Browse never sent one or rendered an input.

**Change.**

- Added a labelled search field to the Browse filter bar. The visible label is `Search`; the input's accessible name is `Search flashcards`.
- Input is debounced by 250 ms before it enters the React Query key, so typing does not fire a query per keystroke.
- `BrowseQueryFilters` now carries `search`; the server-side `browse` filter runs before sorting and offset slicing, so infinite scrolling pages the filtered result set.
- Search composes with state, deck, tag, and sort filters.
- Extended the backend haystack with typed-answer accepted answers in addition to front/back/tags (the hydrated front/back already cover cloze text and cloze answers).
- Added a `No flashcards match “…”` state with a `Clear search` button.

**Verification.**

- [Search for “fsrs”](screenshots/browse-search-fsrs.png) returns two cards and the summary `2 flashcards of 4 flashcards · 2 archived`.
- Selecting a deck filter while the search is active returns the `No flashcards match “fsrs”` state, proving composition.
- Sorting by `Front (A–Z)` while the search is active reordered the two results (`Armin schedules…` before `What abbreviation…`).
- [No-match state](screenshots/browse-search-no-matches.png).
- DOM check: `input.labels` yields `["Search"]`, `aria-label` is `Search flashcards`, and `tabIndex` is `0`.
- The walkthrough data has five cards, so pagination with more than one page of matches was not re-exercised. The filter is part of the same server-side browse query that produces each page, so it applies to every page rather than only the first.

## Issue 4 — Removed tags stay in the Browse tag filter

**Root cause.** `flashcards.listTags` read the library's remembered `tags` dictionary, which keeps canonical tag names after their last card stops using them.

**Change.** `listTags` now derives options from the tags on current flashcards (case-insensitive de-duplication, same approach as `listDeckTags`). No tag rows are deleted; only the filter options change.

**Verification.** Created a temporary card with tag `geography`; the tag appeared in the Browse filter. Deleted that card; reopened Browse and the filter listed only `demo` and `html-test`. [Tag options after removal](screenshots/browse-tag-options-in-use.png).

## Issue 5 — Graph/Review controls are a button inside a link

**Root cause.** The deck header rendered `<Link><Button>Graph</Button></Link>` and the same shape for Review, producing invalid nested interactive content and duplicate tab stops.

**Change.** The deck header renders the Graph and Review actions as TanStack `Link` elements styled with `buttonVariants`, so each action is one anchor. Deck settings and Add card remain buttons.

**Verification.** Snapshot exposes `link "Graph"` and `link "Review"` with no child buttons. A DOM evaluation returned `childButtons: 0` for all three navigation links (`Review` in the sidebar, deck `Graph`, deck `Review`). [Deck header](screenshots/deck-counts-archived.png).

## Issue 6 — Duplicate deck names in deck filter options

**Root cause.** The Browse deck filter used raw deck names, so decks with the same name were indistinguishable.

**Change.** `buildDeckFilterOptions` in `apps/web/src/lib/browse.ts` numbers duplicate names with a leading `1 ·`, `2 ·` prefix, ordered by name then id. Unique names are unchanged. Duplicate names remain allowed, as decided. The create/rename dialog is outside this task's file scope, so no non-blocking hint was added there.

**Verification.** Two decks named `Duplicate QA deck` produced options `1 · Duplicate QA deck` and `2 · Duplicate QA deck`; the prefix survives the combobox's label truncation. [Deck filter](screenshots/browse-deck-filter-duplicates.png).

## Validation

Run from the repository root:

- `pnpm typecheck` — passed (4 packages).
- `pnpm lint` — passed.
- `pnpm --filter @armin/web build` — passed.
- `pnpm --filter @armin/mobile check:bundle` — passed (Android and iOS bundles).

No generated Convex or route files changed. No new test suites were added.

## Data and environment left behind

The isolated deployment retains `Agent sample library` (four active cards plus one archived HTML test card), two empty `Duplicate QA deck` decks created for the duplicate-label check, and one archived-only card in the second duplicate deck. `pnpm dev` and the named agent-browser session were stopped after the walkthrough.
