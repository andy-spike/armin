# Independent migration verification

Parent review of the Opus development migration, 2026-10-19. This record covers the development implementation and its correction pass. It distinguishes direct observations from source-review findings.
No new unit, integration, or E2E suites were added.

## Checks observed by the parent

- Root `pnpm typecheck`: passed in all seven workspaces, using current Turbo
  cache entries for unchanged inputs.
- Root `pnpm lint`: passed with no reported errors or warnings.
- `pnpm --filter @armin/web build`: passed for client and server output.
- `pnpm --filter ./apps/mobile check:bundle`: Android and iOS exports passed.
- Chromium through T3 preview, 1280 by 800: created the dedicated
  `Parent verification — study flow` deck, a basic flashcard and a tag; the data
  persisted and appeared in the review queue. Revealed and rated the card Good;
  the deck became caught up.
- Android emulator discovery/open succeeded, but its existing Expo screen
  reported that Metro was unavailable. This is not a completed parent mobile
  walkthrough; Metro needs restarting before checking the native flow.

## Findings found during independent review

1. **Stale graph changes are accepted.** Directly exercised the actual signed-in
   app client against the dedicated QA deck. Read its graph, saved one node at
   100/100, then saved a second position at 250/200 from the same initial view.
   Both returned `{ ok: true }` and the second position won. The graph response
   and mutations carry no expected revision. The agreed first-accepted-change
   policy therefore does not cover graph edges or canvas layout.
2. **Upload finalization lacks ownership proof.** Source review of
   `convex/media.ts` shows a public `finalizeUpload(storageId)` action reading
   the blob before establishing who uploaded it. An unclaimed blob can be
   attached to the caller's library, and invalid bytes are deleted before
   checking whether that storage ID belongs to another resource. A storage ID
   alone is not ownership proof. Cross-account exploitation has not yet been
   exercised by the parent; the missing authorization is visible in the code.
3. **The final review cannot be undone through the web UI.** After rating the
   only due card Good, the caught-up panel contains no Undo control, although
   the review transaction succeeded. `ReviewSession` renders Undo only in the
   active-review branch. Keep a usable Undo action on the completion state and
   show stale/error outcomes there as well.
4. **Several history operations are still unbounded.** The backend README says
   unbounded review history is always paged or deleted in batches. However,
   `deleteReviewUnit`, flashcard deletion consequences, and flashcard move use
   `.collect()` over all matching history. Source review only: a long-lived card
   can exceed Convex read/write limits, preventing these operations. Reuse
   bounded cleanup and derive deck membership when possible rather than
   rewriting unbounded history inside one study mutation.

Opus's correction task stopped at its API rate limit before making corrections.
The parent implemented the corrections below and repeated the affected workflows.

## Corrections and direct verification

1. Graph queries return the library revision. Edge add/remove and layout writes
   require that revision and reject a stale one atomically. The client serializes
   its own pending graph writes, carries the accepted revision forward, and
   reloads after a failure. Creating a card reads its new revision before the
   queued placement/link steps. Direct calls through the signed-in app client
   verified that the first layout save succeeds, the stale second save fails
   with `CONFLICT`, and a stale edge removal fails after an accepted add. A
   freshly loaded edge removal succeeds. The guard is conservative: another
   saved library change can require a graph reload.
2. Removed public upload-URL issuance and storage-ID finalization. The Start
   route forwards authenticated raw bytes to a Convex HTTP action. It validates
   the byte count and image signature before creating its own storage blob and
   recording its library owner. No client supplies a storage ID. The same-origin
   proxy checks Origin. Direct browser checks: invalid PNG bytes return 400,
   unauthenticated upload returns 401, valid PNG upload succeeds, and its private
   read returns 200. Prior cross-account media-read coverage is in the Opus
   walkthrough. The former arbitrary-blob attachment path no longer exists.
3. The completion panel keeps Undo and its error message visible. Through the
   actual review UI, revealed and rated the only queued test card Good, observed
   All caught up with Undo, clicked Undo, and saw the same card restored with
   Show answer. This was checked in the deck review route.
4. Review-unit deletion now schedules batches of at most 400 history rows.
   Deck deletion supplies removed unit IDs to a bounded cleanup job, including
   cards moved into that deck. Moving a card changes active units only; export
   derives history's current deck from those units. Deletion consequences use
   the units' FSRS lifetime review counts and indexed first/last logs. Today's
   Frontier queries an index of New reviews and ignores deleted units immediately.
   Direct browser scenario: created a card in a temporary deck, rated it, moved
   it, deleted the former deck, and verified its history count remained one.
   Downloaded the ZIP and verified the review's current deck and every manifest
   checksum. Deleted the probe card and confirmed its history cleanup left zero
   matching rows through the Convex dev CLI. Large-history load testing was not
   performed; batch bounds and absence of lifetime-history mutation reads were
   checked in source.

## Final validation and mobile runtime

- Regenerated Convex bindings and pushed the corrected functions to DEV using
  `pnpm --filter @armin/backend dev:once`.
- Root typecheck passed all seven workspaces after corrections.
- Root lint passed. Web client/server production build passed.
- Android and iOS mobile bundle exports passed. No new test suites were added.
- Parent ran Expo Go on the Android 16 Pixel 7 emulator: email/password sign-in,
  reactive deck list, private-image card, reveal, Good rating, and Undo succeeded.
  Undo restored the due count and displayed Review undone. Metro is running on
  port 8081. Sign-out returned to the login form. Screenshot evidence:
  [Android undo](2026-10-19-web-dev/parent-android-undo.png). This is an emulator,
  not a physical phone or Android Chrome.
- Parent browser checks used Chromium on Linux at 1280 by 800. The implementation
  walkthrough separately records phone viewport emulation. Firefox, Safari,
  iPhone Safari, physical Android Chrome, and native iOS were not checked here.
  iOS Simulator is unavailable on this Linux host.
- No production deployment, domain setup, Electron retirement, commits, or pushes
  were performed. The scope remains development workflows.
Google OAuth completion and real delivery to the owner's inbox remain human
identity/inbox checks; the implementation report records them as unverified.
