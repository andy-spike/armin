import type { FlashcardContent, FlashcardType } from "../flashcard-types";
import type { FsrsFieldsMs } from "../scheduler";

export type AnkiPackageFormat = "anki2" | "anki21" | "anki21b" | "text";

export type AnkiField = { ord: number; name: string };

export type AnkiTemplate = {
  ord: number;
  name: string;
  qfmt: string;
  afmt: string;
};

export type AnkiNotetype = {
  id: string;
  name: string;
  kind: "standard" | "cloze";
  stockKind: number | null;
  fields: AnkiField[];
  templates: AnkiTemplate[];
};

export type AnkiDeck = {
  id: string;
  name: string;
  configId?: string | null;
};

export type AnkiDeckConfig = {
  id: string;
  name: string;
  learnSteps: number[] | null;
  relearnSteps: number[] | null;
  maximumInterval: number | null;
  desiredRetention: number | null;
  fsrsParams: number[];
  newPerDay: number | null;
  reviewsPerDay: number | null;
};

export type AnkiNote = {
  id: string;
  notetypeId: string;
  fields: string[];
  tags: string[];
};

export type AnkiCard = {
  id: string;
  noteId: string;
  deckId: string;
  ord: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  data: string;
  flags?: number;
};

export type AnkiReview = {
  id: number;
  cardId: string;
  ease: number;
  ivl: number;
  lastIvl: number;
  factor: number;
  type: number;
};

export type AnkiCollection = {
  format: AnkiPackageFormat;
  createdAt: number;
  notetypes: AnkiNotetype[];
  decks: AnkiDeck[];
  deckConfigs?: AnkiDeckConfig[];
  notes: AnkiNote[];
  cards: AnkiCard[];
  revlog: AnkiReview[];
  mediaNames: string[];
  occlusionMasks?: Record<string, string>;
};

export const ANKI_MEDIA_PREFIX = "anki-media:";

export type ImportProgressMode = "keep" | "fresh";

export type ImportOptions = {
  progress: ImportProgressMode;
  deckIds?: string[];
  limit?: { flashcards: number; reviewUnits: number };
  now: number;
  rasterizeSvg?: boolean;
  notetypeMappings?: Record<string, NotetypeMapping>;
};

export type NotetypeMapping =
  | { kind: "template" }
  | { kind: "basic" | "basic_reversed"; front: number[]; back: number[] }
  | { kind: "type_answer"; front: number[]; answer: number };

export type ImportDeckSettings = {
  requestRetention: number | null;
  maximumInterval: number | null;
  learningSteps: string | null;
  relearningSteps: string | null;
  weights: string | null;
};

export type ImportDeck = {
  key: string;
  name: string;
  ankiName: string;
  cardCount: number;
  settings?: ImportDeckSettings;
  ankiLimits?: { newPerDay: number | null; reviewsPerDay: number | null; preset: string };
  split?: {
    key: string;
    parts: number;
    cards: number;
    cap: "flashcards" | "reviewUnits";
  };
};

export type ImportReviewLog = {
  rating: number;
  review: number;
  before: FsrsFieldsMs;
  after: FsrsFieldsMs;
};

export type ImportReviewUnit = {
  subKey: string;
  schedule: FsrsFieldsMs | null;
  logs: ImportReviewLog[];
  buried?: boolean;
};

export type ImportFlashcard = {
  key: string;
  deckKey: string;
  type: FlashcardType;
  content: FlashcardContent;
  tags: string[];
  archived: boolean;
  units: ImportReviewUnit[];
  media: string[];
  newPosition?: number | null;
  source?: {
    noteId: string;
    notetypeId: string;
    ankiCardIds: string[];
  };
};

export type ImportOmittedReason =
  | "missing_notetype"
  | "empty_content"
  | "missing_image"
  | "unsupported_image"
  | "audio_only"
  | "unusable_template"
  | "unreadable_masks"
  | "unsupported_occlusion";

export type ImportOmitted = {
  noteId: string;
  notetypeId: string;
  notetypeName: string;
  deckId: string;
  cardCount: number;
  reason: ImportOmittedReason;
};

export type ImportWarningCode =
  | "audio_removed"
  | "tts_removed"
  | "video_removed"
  | "unsupported_image_removed"
  | "missing_media"
  | "math_as_text"
  | "math_unsupported"
  | "nested_cloze_flattened"
  | "shared_cloze_narrowed"
  | "occlusion_shape_approximated"
  | "occlusion_labels_removed"
  | "custom_notetype_rendered"
  | "audio_only_card_skipped"
  | "required_content_card_skipped"
  | "additional_fields_added"
  | "additional_fields_omitted"
  | "empty_note_skipped"
  | "content_truncated"
  | "tags_trimmed"
  | "scripts_removed"
  | "flags_as_tags";

export type ImportWarning = {
  code: ImportWarningCode;
  count: number;
  message: string;
};

export type ImportPlan = {
  decks: ImportDeck[];
  flashcards: ImportFlashcard[];
  warnings: ImportWarning[];
  omitted?: ImportOmitted[];
  limit?: { leftOut: number };
  reviewLogsDropped?: number;
  totals: {
    flashcards: number;
    reviewUnits: number;
    reviewLogs: number;
    mediaFiles: number;
    byType: Partial<Record<FlashcardType, number>>;
  };
};
