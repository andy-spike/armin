/**
 * Contract types for importing Anki decks.
 *
 * The pipeline has three stages that only meet through these types:
 *
 * 1. A reader (web client) opens an `.apkg`, `.colpkg`, or plain-text export and
 *    produces an {@link AnkiCollection}: Anki's own data, normalized across the
 *    legacy (`collection.anki2`/`.anki21`) and current (`collection.anki21b`)
 *    package layouts, with no Armin rules applied.
 * 2. The converter (`@armin/core/anki`) turns that collection into an
 *    {@link ImportPlan}: Armin flashcards, scheduling, review history, and
 *    warnings. It is pure and portable (no SQLite, DOM, or Node APIs).
 * 3. The client uploads the referenced media, swaps each
 *    {@link ANKI_MEDIA_PREFIX} placeholder for its `armin-media:` reference,
 *    and sends the cards to the backend `imports` functions in batches.
 *
 * Ids are strings because Anki ids are 64-bit integers that can exceed
 * `Number.MAX_SAFE_INTEGER`. Timestamps in Armin-facing types are epoch ms.
 */

import type { FlashcardContent, FlashcardType } from "../flashcard-types";
import type { FsrsFieldsMs } from "../scheduler";

// --- Stage 1: normalized Anki data (reader output) ---

export type AnkiPackageFormat = "anki2" | "anki21" | "anki21b" | "text";

export type AnkiField = { ord: number; name: string };

export type AnkiTemplate = {
  ord: number;
  name: string;
  /** Question (front) template, Anki mustache-like syntax. */
  qfmt: string;
  /** Answer (back) template; usually contains `{{FrontSide}}`. */
  afmt: string;
};

export type AnkiNotetype = {
  id: string;
  name: string;
  /** Anki notetype kind: cloze notetypes generate one card per cloze number. */
  kind: "standard" | "cloze";
  /**
   * Anki's `originalStockKind` (current format) when known: 0 custom, 1 basic,
   * 2 basic+reversed, 3 basic optional reversed, 4 basic typing, 5 cloze,
   * 6 image occlusion. Null when the package doesn't record it.
   */
  stockKind: number | null;
  fields: AnkiField[];
  templates: AnkiTemplate[];
};

export type AnkiDeck = {
  id: string;
  /** Full path with Anki's `::` separator, e.g. `Spanish::Verbs`. */
  name: string;
};

export type AnkiNote = {
  id: string;
  notetypeId: string;
  /** Raw HTML field values, in field `ord` order. */
  fields: string[];
  tags: string[];
};

export type AnkiCard = {
  id: string;
  noteId: string;
  deckId: string;
  /** Template ord (standard notetypes) or cloze number − 1 (cloze notetypes). */
  ord: number;
  /** 0 new, 1 learning, 2 review, 3 relearning. */
  type: number;
  /** -3/-2 buried, -1 suspended, 0 new, 1 learning, 2 review, 3 day-learn, 4 preview. */
  queue: number;
  /** Review: days since collection creation. Learning: epoch seconds. New: position. */
  due: number;
  /** Interval in days (negative = seconds, learning). */
  ivl: number;
  /** Ease in permille (2500 = 250%). */
  factor: number;
  reps: number;
  lapses: number;
  /** Raw `cards.data` JSON string; may hold FSRS memory state `{ s, d, dr }`. */
  data: string;
};

export type AnkiReview = {
  /** Review time, epoch ms (Anki's revlog id). */
  id: number;
  cardId: string;
  /** Button: 1 again, 2 hard, 3 good, 4 easy. 0 = manual reschedule. */
  ease: number;
  ivl: number;
  lastIvl: number;
  factor: number;
  /** 0 learn, 1 review, 2 relearn, 3 filtered/cram, 4 manual, 5 rescheduled. */
  type: number;
};

export type AnkiCollection = {
  format: AnkiPackageFormat;
  /** Collection creation time, epoch seconds (`col.crt`); review due dates count days from it. */
  createdAt: number;
  notetypes: AnkiNotetype[];
  decks: AnkiDeck[];
  notes: AnkiNote[];
  cards: AnkiCard[];
  revlog: AnkiReview[];
  /** File names present in the package's media, as referenced from note HTML. */
  mediaNames: string[];
};

// --- Stage 2: Armin import plan (converter output) ---

/**
 * Media placeholder used in converted content until the client has uploaded
 * the file: `anki-media:<encodeURIComponent(ankiFileName)>`.
 */
export const ANKI_MEDIA_PREFIX = "anki-media:";

export type ImportProgressMode = "keep" | "fresh";

export type ImportOptions = {
  progress: ImportProgressMode;
  /** Anki deck ids to import. Omit for every deck that has cards. */
  deckIds?: string[];
  /** Import time, epoch ms. */
  now: number;
};

export type ImportDeck = {
  /** Anki deck id. */
  key: string;
  /** Armin deck name: the Anki path joined with " › ", trimmed to the name limit. */
  name: string;
  ankiName: string;
  cardCount: number;
};

/** One review in the imported history, mirroring the backend `reviewLogs` row. */
export type ImportReviewLog = {
  /** 1 again, 2 hard, 3 good, 4 easy. */
  rating: number;
  /** Review time, epoch ms. */
  review: number;
  /** FSRS state before this review. */
  before: FsrsFieldsMs;
  /** FSRS state after this review. */
  after: FsrsFieldsMs;
};

export type ImportReviewUnit = {
  /** Matches `generateReviewUnits(type, content)` subKeys. */
  subKey: string;
  /** Imported schedule; null = start as a new card. */
  schedule: FsrsFieldsMs | null;
  /** Oldest first. Empty when progress is "fresh" or Anki has no history. */
  logs: ImportReviewLog[];
};

export type ImportFlashcard = {
  /** Stable key within the plan, e.g. `<noteId>` or `<noteId>:<templateOrd>`. */
  key: string;
  deckKey: string;
  type: FlashcardType;
  /** Valid content except that images use {@link ANKI_MEDIA_PREFIX} placeholders. */
  content: FlashcardContent;
  tags: string[];
  archived: boolean;
  units: ImportReviewUnit[];
  /** Anki media file names this card's content references. */
  media: string[];
};

export type ImportWarningCode =
  | "audio_removed"
  | "video_removed"
  | "unsupported_image_removed"
  | "missing_media"
  | "math_as_text"
  | "math_unsupported"
  | "nested_cloze_flattened"
  | "shared_cloze_narrowed"
  | "occlusion_shape_approximated"
  | "custom_notetype_rendered"
  | "audio_only_card_skipped"
  | "required_content_card_skipped"
  | "additional_fields_added"
  | "additional_fields_omitted"
  | "empty_note_skipped"
  | "content_truncated"
  | "tags_trimmed"
  | "scripts_removed";

export type ImportWarning = {
  code: ImportWarningCode;
  /** How many notes or files the warning applies to. */
  count: number;
  message: string;
};

export type ImportPlan = {
  decks: ImportDeck[];
  flashcards: ImportFlashcard[];
  warnings: ImportWarning[];
  totals: {
    flashcards: number;
    reviewUnits: number;
    reviewLogs: number;
    /** Distinct media files referenced by imported cards. */
    mediaFiles: number;
    byType: Partial<Record<FlashcardType, number>>;
  };
};
