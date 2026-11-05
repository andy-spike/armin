# Concept authoring QA — 2026-11-05

Checkout `t3/concept-card-authoring-qa`, isolated local Convex deployment and web app at `http://armin-fa62e50708.localhost:37268`. Signed in with the seeded account, using the local fake generator. Browser screenshots are from the automated desktop browser session.

## Walkthrough

- Free account: selected Concept in Add card and saw the Pro explanation and See plans link ([screenshot](2026-11-05-concept-qa-authoring/free-upsell.png)). Enabled complimentary Pro and the template form became available. Empty fields kept Add card disabled. Pasting a Markdown image in the brief and submitting was refused with the text-and-equations error. An HTML audio element was also refused; the concept toolbar did not offer image or audio insertion. A 21,000-character brief was refused with the 20,000-character content limit.
- Created a concept with a brief and worked example. The panel moved from generating to ten ready variants ([screenshot](2026-11-05-concept-qa-authoring/ready.png)); the usage row moved from 10 reserved / 0 used to 0 reserved / 10 used. Created another template with `$x^2$` ([screenshot](2026-11-05-concept-qa-authoring/math-template.png)); KaTeX rendered in the card and variants. Edited a variant and saw its Edited label and rendered math. Deleted a variant after the confirmation.
- Used a temporary fixture to leave one active variant and flag the rest. The last active variant's Delete button was disabled ([screenshot](2026-11-05-concept-qa-authoring/last-active.png)). Unflagged one in the editor, then flagged the assigned exercise in review: another exercise appeared without rating. After a fixture restored a single active variant with refills stopped, flagging it was refused with an explanation ([screenshot](2026-11-05-concept-qa-authoring/last-flag.png)).
- Opened the same variant for editing in two tabs. Saved in the first and then saved the stale draft in the second; the second showed a conflict and did not overwrite the first ([screenshot](2026-11-05-concept-qa-authoring/conflict.png)).
- Disabled complimentary Pro. The card was labelled Requires Pro, its template and variants were readable without editing controls, Save was disabled, and the due count dropped ([screenshot](2026-11-05-concept-qa-authoring/lapsed.png)). Restoring Pro restored editing and review admission.
- Removed `CONCEPT_GENERATOR_FAKE` from the local deployment temporarily. `concepts:availability` returned unavailable and the Concept picker was disabled ([screenshot](2026-11-05-concept-qa-authoring/unavailable.png)). Restored the fake afterward; no gateway model was set.
- Used a temporary local-only internal fixture to put an existing card in generating with a real reservation, then invoked `concepts:expireGeneration` directly. It released the reservation without charging, displayed the timeout and Retry ([screenshot](2026-11-05-concept-qa-authoring/failed.png)). Retry showed generating, reserved 10, and settled to 10 additional used variants when the fake completed.
- Set local usage to 2,000 using the temporary fixture, expired a synthetic job, and retried. The panel showed allowance used and existing variants available for reuse ([screenshot](2026-11-05-concept-qa-authoring/allowance.png)). Reset usage to the actual count; the panel offered Retry again and generation resumed. The account page showed the usage and UTC reset date ([screenshot](2026-11-05-concept-qa-authoring/usage.png)). Fixture functions were removed afterward.

## Bug fixed: reservation released twice after deletion

**Severity: high.** With two batches reserved in one library, let the watchdog expire the first job, delete its card, and let the first action report late. Before the fix, the late callback saw the missing card and subtracted the first reservation again from the shared total, releasing the other job's reservation. This could permit generation beyond the monthly allowance. Conversely, if a card was deleted while its action never reported, the old watchdog could not release its reservation.

Deletion now settles the current reservation atomically before deleting the card. Late callbacks do nothing when their job is no longer current. A temporary local fixture reserved two batches, expired and deleted the first card, then invoked its late failure: the second reservation remained at 10. A separate run deleted a still-generating card and invoked its late store: only the deleted job's reservation was released and no variants were stored. The fixture was removed. These controlled calls exercised the production mutations; they did not wait ten minutes for the scheduled watchdog.

## Not covered

Direct authenticated server bypass attempts and a real provider failure were not exercised in this walkthrough. The earlier feature walkthroughs cover additional paths, but are not a substitute for those checks here. The local fixture deleted cards through the cascade directly, bypassing outer counter maintenance, so its synthetic checkout data is not suitable for checking deck totals.

## Checks

`pnpm check`, `pnpm --filter @armin/web build`, and `pnpm --filter @armin/mobile check:bundle` passed. No new test suite was added.
