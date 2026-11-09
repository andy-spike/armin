export const CONCEPT_SUBKEY = "concept";

export const CONCEPT_BATCH_SIZE = 10;

export const CONCEPT_LOW_WATER_MARK = 3;

export const MAX_VARIANT_FIELD_CHARS = 5_000;

export const CONCEPT_POOL_STATUSES = ["generating", "ready", "failed", "allowanceUsed"] as const;
export type ConceptPoolStatus = (typeof CONCEPT_POOL_STATUSES)[number];

export const CONCEPT_VARIANT_STATUSES = ["active", "flagged"] as const;
export type ConceptVariantStatus = (typeof CONCEPT_VARIANT_STATUSES)[number];

const MEDIA_REFERENCE_RE = /!\[|<(?:img|audio|video|picture|source)\b/i;

export function hasMediaReference(text: string) {
  return MEDIA_REFERENCE_RE.test(text);
}

export function isAwaitingVariant(unit: { subKey: string; variantId?: string }) {
  return unit.subKey === CONCEPT_SUBKEY && unit.variantId == null;
}

export function unseenVariantCount(
  variants: { status: ConceptVariantStatus; lastShownAt?: number | null }[],
) {
  return variants.filter((variant) => variant.status === "active" && variant.lastShownAt == null)
    .length;
}

export function isLowOnVariants(
  variants: { status: ConceptVariantStatus; lastShownAt?: number | null }[],
) {
  return (
    variants.some((variant) => variant.status === "active") && unseenVariantCount(variants) === 0
  );
}

export function pickPracticeVariant<T extends { status: ConceptVariantStatus }>(
  variants: T[],
  seed: number,
  unitId: string,
) {
  const active = variants.filter((variant) => variant.status === "active");
  if (active.length === 0) return null;
  let hash = 2166136261;
  for (const char of `${seed}:${unitId}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return active[(hash >>> 0) % active.length]!;
}

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
