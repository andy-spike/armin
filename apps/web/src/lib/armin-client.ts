import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "@armin/backend/api";
import type {
  BuryResult,
  BuryUnit,
  CramRateResult,
  CramUndoResult,
  Id,
  RateResult,
  UndoResult,
  UnburyResult,
  UpdateResult,
} from "@armin/backend/types";
import type { FlashcardContent, FlashcardType } from "@armin/core/flashcard-types";
import type { Grade } from "@/types/view-models";

/**
 * Imperative calls to the Convex backend: writes, plus a few reads a page
 * needs once rather than live (a form's starting values, a card loaded for
 * editing). Pages read everything else through the live subscriptions in
 * `queries.ts`. This layer turns the UI's string ids into Convex ids, gives
 * each create, rating, and undo a request id so retries apply once, and turns
 * an edit conflict into a `StaleError` the UI can offer to reload.
 */

let client: ConvexReactClient | null = null;

export function setConvexClient(next: ConvexReactClient) {
  client = next;
}

export function convexClient() {
  if (!client) throw new Error("Convex client is not ready.");
  return client;
}

/** The server's message for a coded error, or a generic fallback. */
export function errorMessage(error: unknown, fallback = "Something went wrong.") {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string } | string;
    if (typeof data === "string") return data;
    if (data?.message) return data.message;
  }
  if (error instanceof Error && /network|fetch|connection/i.test(error.message)) {
    return "Connection lost. Check your network and try again.";
  }
  return fallback;
}

export function errorCode(error: unknown): string | null {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string };
    return data?.code ?? null;
  }
  return null;
}

/** A thrown conflict carries the latest version so the UI can offer a reload. */
export class StaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleError";
  }
}

export function newRequestId() {
  return crypto.randomUUID();
}

const q = () => convexClient();

function toDate(value: number | null) {
  return value == null ? null : new Date(value);
}

function unwrapUpdate(result: UpdateResult) {
  if (result.status === "conflict") throw new StaleError(result.message);
  return result;
}

export type SettingsUpdate = Omit<FunctionArgs<typeof api.settings.update>, never>;
export type DeckSettingsUpdate = Omit<FunctionArgs<typeof api.settings.updateDeck>, "deckId">;

/** A failed image upload, with the HTTP status so callers can tell a full library from a hiccup. */
export class MediaUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MediaUploadError";
  }
}

export type ImportedMedia = { ref: string; fileName: string; mime: string; bytes: number };

export const armin = {
  decks: {
    create: ({
      requestId,
      ...input
    }: {
      name: string;
      description?: string | null;
      requestId?: string;
    }) => q().mutation(api.decks.create, { ...input, requestId: requestId ?? newRequestId() }),
    update: async (input: {
      id: string;
      version: number;
      name?: string;
      description?: string | null;
    }) => {
      const result = await q().mutation(api.decks.update, {
        deckId: input.id as Id<"decks">,
        expectedVersion: input.version,
        name: input.name,
        description: input.description,
      });
      if (result.status === "conflict") {
        throw new StaleError("This deck was changed elsewhere. Reopen it to edit.");
      }
      return result;
    },
    delete: (id: string) => q().mutation(api.decks.remove, { deckId: id as Id<"decks"> }),
  },
  flashcards: {
    get: async (id: string) => (await q().query(api.flashcards.get, { flashcardId: id })) ?? null,
    deleteConsequences: async (id: string) => {
      const result = await q().query(api.flashcards.deleteConsequences, {
        flashcardId: id as Id<"flashcards">,
      });
      if (!result) throw new Error("Flashcard not found.");
      return {
        ...result,
        firstReviewAt: toDate(result.firstReviewAt),
        lastReviewAt: toDate(result.lastReviewAt),
      };
    },
    create: (input: {
      deckId: string;
      type: FlashcardType;
      content: FlashcardContent;
      tags?: string[];
      requestId?: string;
    }) =>
      q().mutation(api.flashcards.create, {
        deckId: input.deckId as Id<"decks">,
        type: input.type,
        content: input.content,
        tags: input.tags,
        requestId: input.requestId ?? newRequestId(),
      }),
    /** Save an edit made from `version`; throws StaleError on conflict. */
    update: async (input: {
      id: string;
      version: number;
      type?: FlashcardType;
      content?: FlashcardContent;
      tags?: string[];
    }) =>
      unwrapUpdate(
        await q().mutation(api.flashcards.update, {
          flashcardId: input.id as Id<"flashcards">,
          expectedVersion: input.version,
          type: input.type,
          content: input.content,
          tags: input.tags,
        }),
      ),
    delete: (id: string) =>
      q().mutation(api.flashcards.remove, { flashcardId: id as Id<"flashcards"> }),
    archive: (id: string, archived: boolean) =>
      q().mutation(api.flashcards.setArchived, {
        flashcardId: id as Id<"flashcards">,
        archived,
      }),
    move: (id: string, targetDeckId: string) =>
      q().mutation(api.flashcards.move, {
        flashcardId: id as Id<"flashcards">,
        targetDeckId: targetDeckId as Id<"decks">,
      }),
  },
  review: {
    preview: async (reviewUnitId: string) =>
      (await q().query(api.review.preview, {
        reviewUnitId: reviewUnitId as Id<"reviewUnits">,
        now: Date.now(),
      })) ?? null,
    rate: (input: {
      reviewUnitId: string;
      rating: Grade;
      version: number;
      requestId: string;
    }): Promise<RateResult> =>
      q().mutation(api.review.rate, {
        reviewUnitId: input.reviewUnitId as Id<"reviewUnits">,
        rating: input.rating,
        expectedVersion: input.version,
        requestId: input.requestId,
      }),
    undo: (input: {
      reviewLogId: string;
      version: number;
      requestId: string;
    }): Promise<UndoResult> =>
      q().mutation(api.review.undo, {
        reviewLogId: input.reviewLogId as Id<"reviewLogs">,
        expectedVersion: input.version,
        requestId: input.requestId,
      }),
    bury: (input: { flashcardId: string; requestId: string }): Promise<BuryResult> =>
      q().mutation(api.review.bury, {
        flashcardId: input.flashcardId as Id<"flashcards">,
        requestId: input.requestId,
      }),
    unbury: (input: {
      flashcardId: string;
      units: BuryUnit[];
      requestId: string;
    }): Promise<UnburyResult> =>
      q().mutation(api.review.unbury, {
        flashcardId: input.flashcardId as Id<"flashcards">,
        units: input.units,
        requestId: input.requestId,
      }),
  },
  cram: {
    /** Practice rating: appends a cram log and never changes the FSRS schedule. */
    rate: (input: {
      reviewUnitId: string;
      rating: Grade;
      requestId: string;
    }): Promise<CramRateResult> =>
      q().mutation(api.cram.rate, {
        reviewUnitId: input.reviewUnitId as Id<"reviewUnits">,
        rating: input.rating,
        requestId: input.requestId,
      }),
    undo: (input: { cramLogId: string; requestId: string }): Promise<CramUndoResult> =>
      q().mutation(api.cram.undo, {
        cramLogId: input.cramLogId as Id<"cramLogs">,
        requestId: input.requestId,
      }),
  },
  graph: {
    getDeck: async (deckId: string) =>
      (await q().query(api.graph.getDeck, { deckId })) ?? { version: 0, nodes: [], edges: [] },
    addPrereq: (prereqId: string, dependentId: string, expectedVersion: number) =>
      q().mutation(api.graph.addPrereq, {
        prereqId: prereqId as Id<"flashcards">,
        dependentId: dependentId as Id<"flashcards">,
        expectedVersion,
      }),
    removePrereq: (prereqId: string, dependentId: string, expectedVersion: number) =>
      q().mutation(api.graph.removePrereq, {
        prereqId: prereqId as Id<"flashcards">,
        dependentId: dependentId as Id<"flashcards">,
        expectedVersion,
      }),
    saveLayout: (
      deckId: string,
      placements: { flashcardId: string; x: number; y: number }[],
      expectedVersion: number,
    ) =>
      q().mutation(api.graph.saveLayout, {
        deckId: deckId as Id<"decks">,
        placements,
        expectedVersion,
      }),
  },
  settings: {
    update: (patch: SettingsUpdate) => q().mutation(api.settings.update, patch),
    getDeck: async (deckId: string) => {
      const result = await q().query(api.settings.getDeck, { deckId: deckId as Id<"decks"> });
      if (!result) throw new Error("Deck settings are not available.");
      return result;
    },
    updateDeck: (deckId: string, patch: DeckSettingsUpdate) =>
      q().mutation(api.settings.updateDeck, {
        deckId: deckId as Id<"decks">,
        ...patch,
      }),
    setTimeZone: (timeZone: string) => q().mutation(api.account.setTimeZone, { timeZone }),
  },
  media: {
    /** Upload an image to private library storage and return its reference. */
    importImage: async (input: {
      file: Blob;
      fileName?: string;
      signal?: AbortSignal;
    }): Promise<ImportedMedia> => {
      const response = await fetch("/media/upload", {
        method: "POST",
        headers: { "Content-Type": input.file.type || "application/octet-stream" },
        body: input.file,
        signal: input.signal,
      });
      if (!response.ok) throw new MediaUploadError(await response.text(), response.status);
      return (await response.json()) as ImportedMedia;
    },
  },
  exports: {
    start: () => q().mutation(api.exports.start, {}),
  },
};

export type ArminClient = typeof armin;
