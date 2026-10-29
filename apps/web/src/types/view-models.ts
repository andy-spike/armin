/**
 * Study data types and view models as the web UI sees them. They come from the Convex
 * backend's public function return types, so client and server stay in sync.
 */
import type { ReviewState } from "@/components/ui/badge";
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

export type UiDeck = DeckWithStats;

export type UiFlashcard = {
  id: string;
  deckId: string;
  type: FlashcardType;
  content: FlashcardContent;
  front: string;
  back: string;
  state: ReviewState;
  locked: boolean;
  archived: boolean;
  dueLabel: string;
  createdAt: string;
  tags: string[];
  /** Version the UI loaded; edits name it so stale saves are rejected. */
  version: number;
};

export type UiBrowseFlashcard = UiFlashcard & {
  deckName: string;
};

export type UiReviewUnit = {
  id: string;
  flashcardId: string;
  type: FlashcardType;
  content: FlashcardContent;
  subKey: string;
  front: string;
  back: string;
  deck?: string;
  deckId?: string;
  /** Review-unit version shown; a rating names it so stale answers are rejected. */
  version: number;
  isNew: boolean;
};

export type UiGraphNode = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  type: FlashcardType;
  state: ReviewState;
  locked: boolean;
  archived: boolean;
  x: number | null;
  y: number | null;
};

export type UiGraphEdge = {
  prereqId: string;
  dependentId: string;
};

export type UiDeckGraph = {
  version?: number;
  nodes: UiGraphNode[];
  edges: UiGraphEdge[];
};

function toDate(value: Date | string | number | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function compactFutureLabel(due: Date, now = new Date()) {
  const ms = Math.max(0, due.getTime() - now.getTime());
  const mins = Math.ceil(ms / 60_000);

  if (mins < 60) return `in ${Math.max(1, mins)}m`;

  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 24) return `in ${hours}h`;

  const days = Math.ceil(ms / 86_400_000);
  if (days < 30) return `in ${days} ${days === 1 ? "day" : "days"}`;

  const months = Math.ceil(days / 30);
  if (months < 12) return `in ${months}mo`;

  const years = Math.ceil(days / 365);
  return `in ${years}y`;
}

export function formatDueLabel(
  card: { locked: boolean; state: number; due: Date | string | number },
  now = new Date(),
) {
  if (card.locked) return "Locked";
  if (card.state === 0) return "New";

  const due = toDate(card.due);
  if (!due || due <= now) return "Due now";
  return compactFutureLabel(due, now);
}

export function toUiFlashcard(flashcard: FlashcardWithMeta): UiFlashcard {
  return {
    id: flashcard.id,
    deckId: flashcard.deckId,
    type: flashcard.type,
    content: flashcard.content,
    front: flashcard.front,
    back: flashcard.back,
    state: flashcard.state as ReviewState,
    locked: flashcard.locked,
    archived: flashcard.archived,
    dueLabel: formatDueLabel(flashcard),
    createdAt: toDate(flashcard.createdAt)?.toISOString() ?? "",
    tags: flashcard.tags,
    version: flashcard.version,
  };
}

export function toUiBrowseFlashcard(flashcard: BrowseFlashcard): UiBrowseFlashcard {
  return {
    ...toUiFlashcard(flashcard),
    deckName: flashcard.deckName,
  };
}

export function toUiReviewUnit(item: ReviewQueueItem): UiReviewUnit {
  return {
    id: item.reviewUnitId,
    flashcardId: item.flashcardId,
    type: item.type,
    content: item.content,
    subKey: item.subKey,
    front: item.front,
    back: item.back,
    deck: item.deckName,
    deckId: item.deckId,
    version: item.version,
    isNew: item.isNew,
  };
}

export function toUiDeckGraph(graph: DeckGraph, deckId: string): UiDeckGraph {
  return {
    version: graph.version,
    nodes: graph.nodes.map((node) => ({
      ...node,
      deckId,
      state: node.state as ReviewState,
    })),
    edges: graph.edges,
  };
}
