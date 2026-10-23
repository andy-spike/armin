/**
 * Study data types as the web UI sees them. They come from the Convex
 * backend's public function return types, so client and server stay in sync.
 */
import type {
  BrowsePage,
  DeckGraph,
  DeckWithStats,
  FlashcardMoveConsequences,
  FlashcardWithMeta,
  ReviewPreview,
  ReviewQueueItem,
  AccountSettings,
} from "@armin/backend/types";
import type { FlashcardContent, FlashcardType } from "@armin/core/flashcard-types";

export type Grade = 1 | 2 | 3 | 4;

export type BrowseFlashcard = BrowsePage["flashcards"][number];
export type PreviewOption = ReviewPreview["options"][number];
export type Settings = AccountSettings;

export type FlashcardDeleteConsequences = {
  dependentCount: number;
  reviewUnitCount: number;
  reviewLogCount: number;
  firstReviewAt: Date | null;
  lastReviewAt: Date | null;
};

export type {
  DeckGraph,
  DeckWithStats,
  FlashcardContent,
  FlashcardMoveConsequences,
  FlashcardType,
  FlashcardWithMeta,
  ReviewQueueItem,
};
