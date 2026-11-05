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

/**
 * A rating that leaves a concept card with fewer unseen active variants than
 * this refills its pool with another batch.
 */
export const CONCEPT_LOW_WATER_MARK = 3;

/** Upper bound for a variant's exercise or solution text. */
export const MAX_VARIANT_FIELD_CHARS = 5_000;

/**
 * Where a concept card's variant pool stands: a generation job is running,
 * the last job stored its variants, the last job failed with a reason, or no
 * job could start because the library's monthly variant allowance is used.
 */
export const CONCEPT_POOL_STATUSES = ["generating", "ready", "failed", "allowanceUsed"] as const;
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
 * back. Until a variant is assigned it has nothing to show, so it waits on the
 * pending schedule, like a locked unit, and stays out of review and cram.
 */
export function isAwaitingVariant(unit: { subKey: string; variantId?: string }) {
  return unit.subKey === CONCEPT_SUBKEY && unit.variantId == null;
}

/** Active variants no review has shown yet. */
export function unseenVariantCount(
  variants: { status: ConceptVariantStatus; lastShownAt?: number | null }[],
) {
  return variants.filter((variant) => variant.status === "active" && variant.lastShownAt == null)
    .length;
}

/**
 * A pool whose reviews repeat exercises: it has active variants, but every
 * one has been shown. An empty pool (first batch pending, or every variant
 * set aside) is not low; its card stays out of the queue instead.
 */
export function isLowOnVariants(
  variants: { status: ConceptVariantStatus; lastShownAt?: number | null }[],
) {
  return (
    variants.some((variant) => variant.status === "active") && unseenVariantCount(variants) === 0
  );
}

/**
 * The variant to show next: a random unseen active variant, otherwise the
 * active variant shown longest ago, so review never blocks on generation.
 * Null when no variant is active. `random` returns a number in [0, 1).
 */
export function pickNextVariant<
  T extends { status: ConceptVariantStatus; lastShownAt?: number | null },
>(variants: T[], random: () => number) {
  const active = variants.filter((variant) => variant.status === "active");
  const unseen = active.filter((variant) => variant.lastShownAt == null);
  if (unseen.length > 0) return unseen[Math.floor(random() * unseen.length)]!;
  let oldest: T | null = null;
  for (const variant of active) {
    if (!oldest || variant.lastShownAt! < oldest.lastShownAt!) oldest = variant;
  }
  return oldest;
}
