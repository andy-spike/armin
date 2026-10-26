import { ConvexError } from "convex/values";
import { api } from "@armin/backend/api";
import type { Id } from "@armin/backend/types";
import { resolveImportMedia, type ImportDeck, type ImportPlan } from "@armin/core/anki";
import {
  generateReviewUnits,
  validateContent,
  type FlashcardContent,
} from "@armin/core/flashcard-types";
import { MAX_MEDIA_FILE_BYTES, MIME_BY_EXT, sniffImageExt } from "@armin/core/media";
import type { FsrsFieldsMs } from "@armin/core/scheduler";
import {
  armin,
  convexClient,
  errorMessage,
  MediaUploadError,
  newRequestId,
} from "@/lib/armin-client";
import type { AnkiReader } from "./reader";

/**
 * Runs an Anki import plan against the backend. Order matters: images upload
 * first and cards are re-validated with the real image references before
 * `imports.start`, so the totals it declares are exact and a full image
 * library stops the import before any deck exists. After `start`, any failure
 * or cancellation removes everything the import created.
 */

const MAX_NAME_CHARS = 120;
// Backend per-call caps (packages/backend/convex/imports.ts).
const MAX_CARDS_PER_CALL = 100;
const MAX_UNITS_PER_CALL = 1500;
const MAX_LOGS_PER_CALL = 1000;
const UPLOAD_CONCURRENCY = 4;
const RETRIES = 2;

export type ImportStage = "images" | "cards" | "history" | "finishing";
type Counter = { done: number; total: number };
export type ImportProgress = {
  stage: ImportStage;
  images: Counter;
  cards: Counter;
  history: Counter;
};

export type ImportSummary = {
  decks: { id: string; name: string; cards: number }[];
  flashcards: number;
  reviewLogs: number;
  /** Cards dropped because an image they depend on could not be imported. */
  skippedCards: number;
  /** Distinct images left out (unsupported, too large, or missing from the file). */
  skippedImages: number;
};

/** Thrown when the user cancels; everything created so far has been removed. */
export class ImportCancelledError extends Error {
  constructor() {
    super("The import was cancelled.");
    this.name = "ImportCancelledError";
  }
}

/** A problem whose message is safe to show as-is. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export function importErrorMessage(error: unknown) {
  if (error instanceof ImportError) return error.message;
  return errorMessage(error, "The import failed. Please try again.");
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new ImportCancelledError();
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new ImportCancelledError());
      },
      { once: true },
    );
  });
}

/** Coded backend errors are deterministic; only unexpected failures are worth repeating. */
function isTransient(error: unknown) {
  if (error instanceof ConvexError || error instanceof ImportCancelledError) return false;
  if (error instanceof MediaUploadError)
    return error.status >= 500 || [408, 409, 429].includes(error.status);
  return !(error instanceof DOMException && error.name === "AbortError");
}

/** Every call retried here carries a request id fixed by the caller, so a repeat is idempotent. */
async function withRetry<T>(signal: AbortSignal, run: () => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    throwIfAborted(signal);
    try {
      return await run();
    } catch (error) {
      // An aborted fetch rejects with AbortError; the user asked to stop, so say so.
      if (signal.aborted) throw new ImportCancelledError();
      if (attempt >= RETRIES || !isTransient(error)) throw error;
      await sleep(600 * 2 ** attempt, signal);
    }
  }
}

/** Deck names must be unique within one import: "Spanish", "Spanish (2)". */
export function uniqueDeckNames(decks: ImportDeck[]) {
  const used = new Set<string>();
  return decks.map((deck) => {
    let name = deck.name;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      let base = deck.name.slice(0, MAX_NAME_CHARS - suffix.length);
      if (/[\ud800-\udbff]$/.test(base)) base = base.slice(0, -1);
      name = `${base.trimEnd()}${suffix}`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** Upload every referenced image a few at a time; returns Anki name -> Armin reference. */
async function uploadMedia(
  reader: AnkiReader,
  names: string[],
  signal: AbortSignal,
  onUploaded: (done: number) => void,
) {
  const refs = new Map<string, string>();
  let next = 0;
  let done = 0;
  let failure: unknown = null;

  const uploadOne = async (name: string) => {
    const bytes = await reader.readMedia(name);
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_MEDIA_FILE_BYTES) return;
    const ext = sniffImageExt(bytes);
    if (!ext) return;
    const file = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME_BY_EXT[ext] });
    try {
      const stored = await withRetry(signal, () =>
        armin.media.importImage({ file, fileName: name, signal }),
      );
      refs.set(name, stored.ref);
    } catch (error) {
      if (error instanceof MediaUploadError && error.status === 413) {
        if (/storage is full/i.test(error.message)) {
          throw new ImportError(
            "Your image storage is full, so these images can't be added. Nothing was imported. Deselect decks with many images, or delete images you no longer need, and try again.",
          );
        }
        return;
      }
      if (error instanceof MediaUploadError && error.status === 400) return;
      throw error;
    }
  };

  const worker = async () => {
    while (!failure) {
      throwIfAborted(signal);
      const index = next++;
      if (index >= names.length) return;
      try {
        await uploadOne(names[index]);
      } catch (error) {
        failure ??= error;
        return;
      }
      onUploaded(++done);
    }
  };

  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, names.length) }, worker));
  if (failure) throw failure;
  return refs;
}

type PreparedCard = {
  key: string;
  deckKey: string;
  type: ImportPlan["flashcards"][number]["type"];
  content: FlashcardContent;
  tags: string[];
  archived: boolean;
  units: ImportPlan["flashcards"][number]["units"];
  unitCount: number;
};

export async function runImport({
  plan,
  reader,
  fileName,
  signal,
  onProgress,
}: {
  plan: ImportPlan;
  reader: AnkiReader;
  fileName: string;
  signal: AbortSignal;
  onProgress: (progress: ImportProgress) => void;
}) {
  const mediaNames = [...new Set(plan.flashcards.flatMap((card) => card.media))];
  const progress: ImportProgress = {
    stage: mediaNames.length > 0 ? "images" : "cards",
    images: { done: 0, total: 0 },
    cards: { done: 0, total: plan.totals.flashcards },
    history: { done: 0, total: plan.totals.reviewLogs },
  };
  const emit = (stage = progress.stage) => onProgress({ ...progress, stage });

  // (a) Images. Nothing exists in the library yet if this stops.
  progress.images.total = mediaNames.length;
  emit();
  const refs = await uploadMedia(reader, mediaNames, signal, (done) => {
    progress.images.done = done;
    emit();
  });
  progress.images.done = mediaNames.length;
  const skippedImages = mediaNames.length - refs.size;

  // (b) Re-validate with the real references, then declare exact totals.
  const prepared: PreparedCard[] = [];
  let skippedCards = 0;
  for (const card of plan.flashcards) {
    let content: FlashcardContent;
    try {
      content = validateContent(card.type, resolveImportMedia(card.content, card.type, refs));
    } catch {
      skippedCards++;
      continue;
    }
    const subKeys = new Set(generateReviewUnits(card.type, content).map((unit) => unit.subKey));
    if (subKeys.size === 0) {
      skippedCards++;
      continue;
    }
    prepared.push({
      key: card.key,
      deckKey: card.deckKey,
      type: card.type,
      content,
      tags: card.tags,
      archived: card.archived,
      units: card.units.filter((unit) => subKeys.has(unit.subKey)),
      unitCount: subKeys.size,
    });
  }
  const cardsPerDeck = new Map<string, number>();
  for (const card of prepared)
    cardsPerDeck.set(card.deckKey, (cardsPerDeck.get(card.deckKey) ?? 0) + 1);
  const decks = plan.decks.filter((deck) => cardsPerDeck.has(deck.key));
  if (prepared.length === 0 || decks.length === 0) {
    throw new ImportError(
      "None of the selected cards could be imported, so nothing was added to your library.",
    );
  }
  const totals = {
    flashcards: prepared.length,
    reviewUnits: prepared.reduce((sum, card) => sum + card.unitCount, 0),
    reviewLogs: prepared.reduce(
      (sum, card) => sum + card.units.reduce((inner, unit) => inner + unit.logs.length, 0),
      0,
    ),
  };
  progress.cards = { done: 0, total: totals.flashcards };
  progress.history = { done: 0, total: totals.reviewLogs };
  throwIfAborted(signal);

  const names = uniqueDeckNames(decks);
  const client = convexClient();
  const startRequestId = newRequestId();
  const started = await withRetry(signal, () =>
    client.mutation(api.imports.start, {
      requestId: startRequestId,
      fileName,
      decks: decks.map((deck, index) => ({ key: deck.key, name: names[index] })),
      totals,
    }),
  );
  const importId = started.importId;

  try {
    // (c) Cards, in batches that respect both per-call caps.
    progress.stage = "cards";
    emit();
    const flashcardIds = new Map<string, Id<"flashcards">>();
    for (let start = 0; start < prepared.length;) {
      throwIfAborted(signal);
      let end = start;
      let units = 0;
      while (
        end < prepared.length &&
        end - start < MAX_CARDS_PER_CALL &&
        (end === start || units + prepared[end].unitCount <= MAX_UNITS_PER_CALL)
      ) {
        units += prepared[end].unitCount;
        end++;
      }
      const batch = prepared.slice(start, end);
      const requestId = newRequestId();
      const result = await withRetry(signal, () =>
        client.mutation(api.imports.addCards, {
          importId,
          requestId,
          cards: batch.map((card) => ({
            key: card.key,
            deckKey: card.deckKey,
            type: card.type,
            content: card.content,
            tags: card.tags,
            archived: card.archived,
            units: card.units.map((unit) => ({ subKey: unit.subKey, schedule: unit.schedule })),
          })),
        }),
      );
      for (const added of result.cards) flashcardIds.set(added.key, added.flashcardId);
      progress.cards.done += batch.length;
      emit();
      start = end;
    }

    // (d) Review history, now that every card has an id.
    if (totals.reviewLogs > 0) {
      progress.stage = "history";
      emit();
      type Log = {
        flashcardId: Id<"flashcards">;
        subKey: string;
        rating: 1 | 2 | 3 | 4;
        review: number;
        before: FsrsFieldsMs;
        after: FsrsFieldsMs;
      };
      let pending: Log[] = [];
      const flush = async () => {
        const logs = pending;
        pending = [];
        const requestId = newRequestId();
        await withRetry(signal, () =>
          client.mutation(api.imports.addReviewLogs, { importId, requestId, logs }),
        );
        progress.history.done += logs.length;
        emit();
      };
      for (const card of prepared) {
        const flashcardId = flashcardIds.get(card.key);
        if (!flashcardId) throw new ImportError("The server did not confirm every card.");
        for (const unit of card.units) {
          for (const log of unit.logs) {
            pending.push({
              flashcardId,
              subKey: unit.subKey,
              rating: log.rating as 1 | 2 | 3 | 4,
              review: log.review,
              before: log.before,
              after: log.after,
            });
            if (pending.length >= MAX_LOGS_PER_CALL) await flush();
          }
        }
      }
      if (pending.length > 0) await flush();
    }

    // (e) Close the import.
    throwIfAborted(signal);
    emit("finishing");
    await withRetry(signal, () => client.mutation(api.imports.finish, { importId }));
  } catch (error) {
    // Best effort: the server also removes a stalled import after an hour.
    let removed = true;
    await client
      .mutation(api.imports.cancel, {
        importId,
        reason:
          error instanceof ImportCancelledError ? "Cancelled by the user." : errorMessage(error),
      })
      .catch(() => (removed = false));
    if (removed) throw error;
    throw new ImportError(
      `${importErrorMessage(error)} Armin couldn't remove the partly imported decks right now; they are cleaned up automatically within an hour.`,
    );
  }

  return {
    decks: started.decks.map(({ key, deckId }) => ({
      id: deckId,
      name: names[decks.findIndex((deck) => deck.key === key)],
      cards: cardsPerDeck.get(key) ?? 0,
    })),
    flashcards: totals.flashcards,
    reviewLogs: totals.reviewLogs,
    skippedCards,
    skippedImages,
  };
}
