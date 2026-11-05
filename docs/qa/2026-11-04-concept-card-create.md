# Concept card creation and first variants walkthrough (2026-11-04)

Local worktree deployment, desktop Chromium via agent-browser (1440×960
viewport), sample account `test@example.com`. Variants come from the generator's
fake provider; no model was called.

1. Deck → **Add card** → **Concept** showed Brief, Example exercise, and Example
   solution editors without the image and audio tools. The exercise and
   solution, written in source, showed their rendered equation previews
   ([screenshot](2026-11-04-concept-card-create/template-form.png)).
2. With `CONCEPT_GENERATOR_FAKE` unset, **Add card** saved the card. The deck
   still showed **3 due now**. Reopening the card showed the type locked to
   Concept and the variants panel reading "Generating variants failed. Variant
   generation isn't set up on this server yet." with **Retry**
   ([screenshot](2026-11-04-concept-card-create/pool-failed.png)).
3. `pnpm exec convex env set CONCEPT_GENERATOR_FAKE true`, then **Retry**: the
   panel showed "Generating variants…"
   ([screenshot](2026-11-04-concept-card-create/pool-generating.png)) and, about
   three seconds later, "10 variants ready". The list showed numbered exercises
   and solutions with rendered equations
   ([screenshot](2026-11-04-concept-card-create/pool-ready.png)).
4. A second template whose brief contained `![diagram](https://example.com/line.png)`
   was refused with "The brief can't contain images or audio. Use text and
   equations." and the form kept the draft
   ([screenshot](2026-11-04-concept-card-create/image-rejected.png)). Without the
   image, it saved. Opening it at once showed "Generating variants…", then
   "10 variants ready".
5. `convex data` showed each concept card with one review unit, `subKey`
   `concept`, an empty front, and the pending due date; its `conceptPool` was
   `ready` (job 1 for the new card, job 2 for the retried one); and 20
   `conceptVariants` rows, all with the library's ID, `active`, and `generated`.
6. The concept cards stayed out of study until variants can be assigned (#95):
   Cram matched 3 review units (4 with locked cards), the same as before
   ([screenshot](2026-11-04-concept-card-create/cram-count.png)), and the deck
   review session held the same 3 cards, none blank
   ([screenshot](2026-11-04-concept-card-create/review-queue.png)).
