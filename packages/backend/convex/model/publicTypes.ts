/**
 * Client-safe type exports for web and mobile. Only types are exported, so
 * importing this module never bundles backend implementation code.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "../_generated/api";

export type { Id, Doc } from "../_generated/dataModel";
export type DeckWithStats = NonNullable<FunctionReturnType<typeof api.decks.list>>[number];
export type FlashcardWithMeta = NonNullable<FunctionReturnType<typeof api.flashcards.get>>;
export type BrowsePage = NonNullable<FunctionReturnType<typeof api.flashcards.browse>>;
export type ReviewQueue = NonNullable<FunctionReturnType<typeof api.review.queue>>;
export type ReviewQueueItem = ReviewQueue["items"][number];
export type ReviewPreview = NonNullable<FunctionReturnType<typeof api.review.preview>>;
export type CardInfo = NonNullable<FunctionReturnType<typeof api.review.cardInfo>>;
export type DeckGraph = NonNullable<FunctionReturnType<typeof api.graph.getDeck>>;
export type AccountSettings = NonNullable<FunctionReturnType<typeof api.settings.get>>;
export type DeckSettingsView = NonNullable<FunctionReturnType<typeof api.settings.getDeck>>;
export type FlashcardDeleteConsequences = NonNullable<
  FunctionReturnType<typeof api.flashcards.deleteConsequences>
>;
export type FlashcardMoveConsequences = NonNullable<
  FunctionReturnType<typeof api.flashcards.moveConsequences>
>;
export type Viewer = NonNullable<FunctionReturnType<typeof api.account.viewer>>;
export type ImportView = NonNullable<FunctionReturnType<typeof api.imports.get>>;
export type ExportRow = NonNullable<FunctionReturnType<typeof api.exports.list>>[number];
export type { BuryResult, BuryUnit, RateResult, UndoResult, UnburyResult } from "../review";
export type { UpdateResult } from "../flashcards";
