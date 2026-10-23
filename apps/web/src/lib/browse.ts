import type { BrowseSortKey as SharedBrowseSortKey } from "@armin/core/study";
import { plural } from "@/lib/utils";
import { FLASHCARD_SORT_OPTIONS } from "./sort-flashcards";

/** Browse adds deck-based ordering on top of the per-deck card sorts. */
export type BrowseSortKey = SharedBrowseSortKey;

export const BROWSE_SORT_OPTIONS: { value: BrowseSortKey; label: string }[] = [
  ...FLASHCARD_SORT_OPTIONS,
  { value: "deck-asc", label: "Deck (A–Z)" },
  { value: "deck-desc", label: "Deck (Z–A)" },
];

/**
 * One card-count rule for deck headers and card grids: the headline counts
 * active cards and archived cards are named separately.
 */
export function formatCardCounts(active: number, archived: number) {
  const cards = plural(active, "flashcard");
  return archived > 0 ? `${cards} · ${archived} archived` : cards;
}

/**
 * Deck filter options that stay distinguishable when names repeat. Each
 * duplicate gets a leading number so the difference survives label
 * truncation; unique names stay clean.
 */
export function buildDeckFilterOptions(decks: { id: string; name: string }[]) {
  const nameCounts = new Map<string, number>();
  for (const deck of decks) {
    nameCounts.set(deck.name, (nameCounts.get(deck.name) ?? 0) + 1);
  }
  const duplicateIndexes = new Map<string, number>();
  return [
    { value: "", label: "All decks" },
    ...[...decks]
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .map((deck) => {
        if ((nameCounts.get(deck.name) ?? 0) <= 1) {
          return { value: deck.id, label: deck.name };
        }
        const index = (duplicateIndexes.get(deck.name) ?? 0) + 1;
        duplicateIndexes.set(deck.name, index);
        return { value: deck.id, label: `${index} · ${deck.name}` };
      }),
  ];
}
