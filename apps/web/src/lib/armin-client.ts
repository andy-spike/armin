import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "@armin/backend/api";
import type {
  Id,
  RateResult,
  UndoResult,
  UpdateResult,
} from "@armin/backend/types";
import type {
  FlashcardContent,
  FlashcardType,
} from "@armin/core/flashcard-types";
import type { Grade } from "@/types/window";

/**
 * The web client's study API. It keeps the shape the desktop renderer used
 * (`window.armin`) so the existing UI can be reused, but every call goes to
 * the authenticated Convex backend, which owns validation and study rules.
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

/** Coarse clock tick passed to time-dependent queries so they re-evaluate. */
export function nowTick(stepMs = 30_000) {
  return Math.floor(Date.now() / stepMs) * stepMs;
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

export type ImportedMedia = { ref: string; fileName: string; mime: string; bytes: number };

export const armin = {
  decks: {
    list: async () => (await q().query(api.decks.list, { now: nowTick() })) ?? [],
    listNames: async () => (await q().query(api.decks.listNames, {})) ?? [],
    get: async (id: string) =>
      (await q().query(api.decks.get, { deckId: id, now: nowTick() })) ?? null,
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
    list: async (deckId: string) =>
      (await q().query(api.flashcards.listByDeck, { deckId, now: nowTick() })) ?? [],
    /** Offset pages over the server's bounded, sorted browse result. */
    browse: async ({
      offset = 0,
      ...input
    }: {
      offset?: number;
      limit: number;
      sort: string;
      state?: number;
      deckId?: string;
      tags?: string[];
      search?: string;
    }) => {
      const page = await q().query(api.flashcards.browse, {
        ...input,
        limit: offset + input.limit,
        now: nowTick(),
      });
      if (!page) return { flashcards: [], filteredTotal: 0, filteredArchived: 0, libraryTotal: 0, libraryArchived: 0 };
      return { ...page, flashcards: page.flashcards.slice(offset) };
    },
    listTags: async () => (await q().query(api.flashcards.listTags, {})) ?? [],
    listDeckTags: async (deckId: string) =>
      (await q().query(api.flashcards.listDeckTags, { deckId })) ?? [],
    get: async (id: string) =>
      (await q().query(api.flashcards.get, { flashcardId: id })) ?? null,
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
    moveConsequences: async (id: string) => {
      const result = await q().query(api.flashcards.moveConsequences, {
        flashcardId: id as Id<"flashcards">,
      });
      if (!result) throw new Error("Flashcard not found.");
      return result;
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
    queue: async (deckId?: string) =>
      (await q().query(api.review.queue, {
        deckId: deckId as Id<"decks"> | undefined,
        now: nowTick(),
      })) ?? null,
    preview: async (reviewUnitId: string) =>
      (await q().query(api.review.preview, {
        reviewUnitId: reviewUnitId as Id<"reviewUnits">,
        now: nowTick(15_000),
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
    ) => q().mutation(api.graph.saveLayout, { deckId: deckId as Id<"decks">, placements, expectedVersion }),
  },
  settings: {
    get: async () => {
      const settings = await q().query(api.settings.get, {});
      if (!settings) throw new Error("Settings are not available.");
      return settings;
    },
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
    importImage: async (input: { file: Blob; fileName?: string }): Promise<ImportedMedia> => {
      const response = await fetch("/media/upload", {
        method: "POST",
        headers: { "Content-Type": input.file.type || "application/octet-stream" },
        body: input.file,
      });
      if (!response.ok) throw new Error(await response.text());
      return await response.json() as ImportedMedia;
    },
  },
  exports: {
    start: () => q().mutation(api.exports.start, {}),
    list: async () => (await q().query(api.exports.list, {})) ?? [],
  },
};

export type ArminClient = typeof armin;
