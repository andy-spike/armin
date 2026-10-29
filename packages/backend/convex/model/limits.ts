/**
 * Technical library bounds, the ceiling for every plan (`@armin/core/plans`).
 * Whole-library work reads counters, indexes, or pages, never every row; the
 * deck bounds keep deck-wide graph and lock work inside one transaction.
 */
export const MAX_DECKS = 1000;
export const MAX_FLASHCARDS = 100_000;
export const MAX_REVIEW_UNITS = 250_000;
export const MAX_REVIEW_UNITS_PER_FLASHCARD = 60;
/** A deck's flashcards, units, and edges must fit one transaction's 32,000 reads. */
export { MAX_FLASHCARDS_PER_DECK } from "@armin/core/plans";
export const MAX_REVIEW_UNITS_PER_DECK = 15_000;
/** Due reviews read for one queue selection; the queue shows at most this many. */
export const MAX_SESSION_REVIEWS = 2000;
/** Prerequisite edges per deck, so deck-wide graph work fits one transaction. */
export const MAX_PREREQS_PER_DECK = 2000;
/** Exports are served by an HTTP action, whose responses are capped at 100 MiB. */
export const MAX_EXPORT_BYTES = 95 * 1024 * 1024;
export const MAX_CONTENT_CHARS = 20_000;
export const MAX_TAGS_PER_FLASHCARD = 20;
export const MAX_NAME_CHARS = 120;
export const MAX_DESCRIPTION_CHARS = 2000;
/** How long request ids are remembered for retry de-duplication. */
export const REQUEST_RETENTION_MS = 7 * 24 * 3_600_000;
/** Export ZIPs are deleted after this. */
export const EXPORT_TTL_MS = 60 * 60_000;
