/**
 * Content and settings bounds the server enforces. Clients and the Anki
 * converter read the same values so they never prepare what the server rejects.
 */

export const MAX_CONTENT_CHARS = 20_000;
export const MAX_NAME_CHARS = 120;
export const MAX_TAGS_PER_FLASHCARD = 100;
export const MAX_TAG_CHARS = 200;
export const MAX_REVIEW_UNITS_PER_FLASHCARD = 60;
/** Past reviews one Anki import may carry; the converter keeps the most recent. */
export const MAX_IMPORT_REVIEW_LOGS = 300_000;

export const RETENTION_MIN = 0.7;
export const RETENTION_MAX = 0.99;
export const MAX_INTERVAL_MIN = 1;
export const MAX_INTERVAL_MAX = 36500;
export const STABILITY_FLOOR_MAX = 365;
/** New review units and reviews per day share one ceiling. */
export const PER_DAY_LIMIT_MAX = 1000;
