/**
 * Free-beta library bounds. They keep every study transaction (queues, graph
 * propagation, lock refresh) and the export snapshot inside Convex limits.
 */
export const MAX_DECKS = 200;
export const MAX_FLASHCARDS = 2000;
export const MAX_REVIEW_UNITS_PER_FLASHCARD = 60;
/** Library-wide cap so queue, browse, and export reads fit one transaction. */
export const MAX_REVIEW_UNITS = 10_000;
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
