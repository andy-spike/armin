/**
 * Concept cards (ADR 0023): a flashcard whose template is practiced through
 * generated exercise variants. These rules need no validation library; the
 * template and variant schemas live with the other content schemas in
 * `flashcard-types`.
 */

/**
 * The fixed `subKey` of a concept card's one review unit. Every variant
 * counts toward this unit, so template edits keep its FSRS history (ADR 0004).
 */
export const CONCEPT_SUBKEY = "concept";

/** Variants one generation job asks for. */
export const CONCEPT_BATCH_SIZE = 10;

/** Upper bound for a variant's exercise or solution text. */
export const MAX_VARIANT_FIELD_CHARS = 5_000;

/**
 * Where a concept card's variant pool stands: a generation job is running,
 * the last job stored its variants, or the last job failed with a reason.
 */
export const CONCEPT_POOL_STATUSES = ["generating", "ready", "failed"] as const;
export type ConceptPoolStatus = (typeof CONCEPT_POOL_STATUSES)[number];

/** A variant is shown in review while active; a flagged one is set aside. */
export const CONCEPT_VARIANT_STATUSES = ["active", "flagged"] as const;
export type ConceptVariantStatus = (typeof CONCEPT_VARIANT_STATUSES)[number];

/** Markdown images (including audio clips) and embedded HTML media. */
const MEDIA_REFERENCE_RE = /!\[[^\]]*\]\(|<(?:img|audio|video|picture|source)\b/i;

/** Templates and variants are text and KaTeX only: no images or audio. */
export function hasMediaReference(text: string) {
  return MEDIA_REFERENCE_RE.test(text);
}

/**
 * A concept card's review unit shows its assigned variant as its front and
 * back. Until a variant is assigned it has nothing to show, so it stays on
 * the pending schedule and out of review and cram.
 */
export function isAwaitingVariant(unit: { subKey: string; front: string }) {
  return unit.subKey === CONCEPT_SUBKEY && unit.front === "";
}
