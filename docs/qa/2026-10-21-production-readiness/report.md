# Web production readiness QA

Date: 2026-10-21
Commit: ec5875f2946b08d11409f5804ea31cc25726bc9f
Environment: isolated T3 development deployment, http://armin-f5fc15c3aa.localhost:31706
Browser: agent-browser managed Chromium, desktop Linux. No real mobile devices.

## Scope

Manual browser exploration of authentication, decks, cards, graph prerequisites, study, persistence, and destructive actions. No automated test suites added. Test data belongs to the isolated synthetic account. This is workflow and interaction stress testing, not concurrent-user capacity testing.

## Results

Recommendation: do not release this build unchanged. Fix ISSUE-001 before first production use. Correct ISSUE-003 before relying on learning progress, and fix ISSUE-002 for narrow-browser graph use. Re-run the affected workflows after fixes.

Three confirmed issues: one high-priority editing defect and two medium-priority correctness/layout defects. No crash or demonstrated stored-content loss occurred during this pass. A successful development walkthrough and build do not establish production readiness for infrastructure or untested authentication providers.

### What was exercised

| Workflow | Observed result |
| --- | --- |
| Sample-account sign-in | Passed; also signed out and signed back in. Wrong password showed an explicit error. |
| Signed-out deep link | Opening the Biology graph URL after sign-out redirected to Sign in. |
| Deck creation | Created Biology and scratch decks. Unicode/emoji names and description persisted. Whitespace-only name left Create disabled. |
| Card creation | Created 19 cards through the browser: five mixed-type Biology cards and fourteen basic multiplication cards. Basic, reversed, cloze, and typed-answer creation worked. Tags persisted across consecutive additions. |
| Repeated entry | Twelve consecutive basic cards saved with their expected questions and answers. A thirteenth card with two rapid Ctrl+Enter submissions appeared once. |
| Editing | First editor opening can be empty, ISSUE-001. Reopening restores content. A subsequent keyboard selection/replacement saved and remained visible after navigating between Browse and the deck. |
| Graph creation | Dragged three prerequisite edges: cell → nucleus, nucleus → DNA cloze, cell → mitochondrion. Dependent cards locked and due counts changed. |
| Graph constraints | Attempted DNA cloze → cell to close a cycle; no edge appeared. No cycle persisted on refresh. |
| Graph tools | Fit view, tidy layout, search input, and refresh worked on a five-card graph. Search-result ranking and large-graph behavior were not assessed. |
| Graph removal | Selected cell → mitochondrion edge and pressed Delete. Edge disappeared and mitochondrion became isolated. |
| Review | Completed all seven Biology review units. Basic reveal, both reversed directions, both cloze deletions, and typed-answer mismatch feedback worked. Used Again, Hard, Good, and Easy, including keyboard shortcuts. |
| Prerequisite unlock | Good on the foundation unlocked nucleus and mitochondrion. Good on nucleus brought its two cloze units into the current session. |
| Undo | Undid the foundation review, observed it return to the queue, refreshed, and reviewed again. Prior unlocked access stayed open, consistent with the app’s stated permanent-unlock policy. |
| Review completion | Reached All caught up; refresh preserved it. Later the typed-answer card became due again near the expected ten-minute interval. No multi-day scheduling verification. |
| Browse | Displayed cards across decks; selected the Biology deck filter and observed only its five cards. Other filter combinations were not exhaustively checked. |
| Archive | Archived and unarchived the reversed card; its visible status updated. |
| Move | Moved the typed-answer card into Agent sample library. Source count dropped from five to four, destination rose from four to five. |
| Progress | Source showed 125% learned and four flashcards/five learned, ISSUE-003. |
| Settings | Opened scheduling and deck settings. Entered out-of-range retention 150 and saved; reopening showed unchanged inherited 90, not an invalid stored value. Valid custom scheduling changes were not assessed. |
| Export | Generated an export, observed a named ZIP and Download 6 KB link, and clicked it. Archive contents and file integrity were not inspected; download completion is not certified. |
| Connection interruption | Twice submitted the same draft during browser offline emulation. Form became busy, then retained its text after reconnect. Explicit retry online saved one card. The first attempt was canceled with its unsaved draft. This checks draft retention and retry only, not offline support or WebSocket-level outage recovery. |
| Card deletion | Canceled one deletion and confirmed the card remained. Repeated and confirmed deletion; card disappeared after refresh. Confirmation described review history and offered Archive instead. |
| Deck rename/delete | Renamed scratch via Enter. Deleted the remaining thirteen scratch cards with the deck. Deck stayed absent after refresh and sign-in. |
| Narrow viewport | Checked deck and graph at 390 × 844 CSS pixels in desktop Chromium. Graph toolbar overlaps, ISSUE-002. No real device or mobile-browser claim. |
| Diagnostics | No uncaught application error appeared in periodic browser error checks before intentional connection/authentication failures. Development console messages were present. |
| Production build | `pnpm --filter @armin/web build` passed. Walkthrough used the development server, not the built server. |

### Data and environment left for follow-up

The isolated library retains the Biology deck with four cards and two edges, plus the original sample deck containing the moved typed-answer card. The scratch deck was removed through the UI. No production data was touched. Setup was run using `pnpm worktree:setup`; the app was launched with `pnpm dev`. The environment URL is listed above; sample credentials are documented in `docs/dev-worktrees.md` and stored locally in `.armin/demo-account.json`. Cloud worktree environments expire after five days unless extended.

No application source or test suites were changed. Evidence files and this report are the task changes.

### Remaining release checks

- Email sign-up, address verification, password-reset delivery, and Google OAuth need a configured environment. Setup reported no Google credentials or email provider for this isolated deployment. These flows are not certified.
- Image attachment, image rendering/export, typed-answer accepted alternatives, card-type conversion, valid scheduling customization, daily-limit boundaries across decks, and account deletion were not completed in this pass.
- Only one account and one active browser session were used. Cross-account isolation, simultaneous tabs/devices, concurrent-user load, very large libraries, and large-graph performance remain unverified.
- No real phones, Firefox, or Safari were exercised. Narrow Chromium layout does not establish mobile browser compatibility.
- Production hosting, deployment secrets, domain/cookies, backups and restore, monitoring, and release/rollback procedures were outside this browser pass. The root README says production hosting/deployment automation is still to be configured.
- No automated test suite was created or run. This report describes exploratory interaction coverage and its limits, not proof that all workflows are reliable.

## ISSUE-001: First card editor after reload loses existing text

Severity: high release priority; a user workaround exists. Category: functional.
URL: /browse

After reloading Browse, opening an existing basic card for the first time shows empty front and back editors and disables Save changes. The tags remain populated. The list preview still contains both texts. This reproduced after two separate reloads, plus the initial occurrence. Closing and reopening the same card restores its text. No data loss was demonstrated because the empty form was not saved.

1. Reload Browse with existing basic cards. [Before](screenshots/issue-001-step-1.png).
2. Open “Which organelle contains most DNA in a human cell?”. Both editors show example placeholders instead of the stored question and answer. Waited at least two seconds during recording and longer during initial discovery. [Broken editor](screenshots/issue-001-step-2.png).
3. Close and reopen the same card. Text returns and saving becomes available. [Reopened](screenshots/issue-001-step-3.png).

[Reproduction video](videos/issue-001-edit-empty.webm). The empty initial editor also occurred from the deck page after visiting deck settings.

## ISSUE-002: Graph toolbar overlaps search at narrow widths

Severity: medium. Category: responsive layout.
URL: /deck/<deck>/graph. Browser viewport: 390 × 844 CSS pixels, desktop Chromium emulation.

The deck back button, search field, and Tidy layout button occupy one row. Tidy layout covers most of the search input, leaving only a small visible portion. Reproduced after reloading at the same width. The graph itself displays after Fit view. This is a browser viewport check, not a real phone test.

1. Open the graph for “QA • Biology foundations 🧬” at 390 × 844.
2. Observe the overlapping controls at the top. [Screenshot](screenshots/issue-002-narrow-toolbar.png).

Repro video: N/A, static layout issue.

## ISSUE-003: Deck learning progress exceeds 100%

Severity: medium. Category: correctness.
URL: /

After studying a deck with basic, reversed, cloze, and typed-answer cards, then moving the typed-answer card to another deck, the source deck displays “4 flashcards” and “125% learned”. Its detail header says “4 flashcards · 5 learned”. The impossible percentage persists after reload. The completed reviews included both directions of the reversed card and both cloze deletions. This suggests mixed counting units, but the cause was not investigated in source.

1. Create the five-card Biology deck described in the workflow results.
2. Review its seven review units, using Good for basic/cloze, Easy for one reversed direction, Hard for the other, and Again for the typed answer.
3. Move the typed-answer card to another deck.
4. Open Decks and reload. Observe 125% learned on the remaining four-card deck. [Screenshot](screenshots/issue-003-progress-125.png).

Repro video: N/A for the persisted visible state. The full creation/study sequence was not recorded; the incorrect state was checked again after reload.
