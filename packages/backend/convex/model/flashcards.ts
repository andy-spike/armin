import {
  flashcardDisplay,
  isFlashcardType,
  serializeContent,
  validateContent,
  type FlashcardContent,
  type FlashcardType,
} from "@armin/core/flashcard-types";
import { contentMediaFileNames } from "@armin/core/media";
import { normalizeTags } from "@armin/core/study";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";
import { MAX_CONTENT_CHARS, MAX_TAGS_PER_FLASHCARD } from "./limits";
import {
  adjustReviewUnitCount,
  canonicalTags,
  deleteReviewUnit,
  parseFlashcard,
  reconcileReviewUnits,
  refreshDependentSubgraph,
  rememberTags,
  SettingsCache,
} from "./study";

/** Validate type + content with the shared core rules; coded errors for clients. */
export function validateFlashcardInput(type: string, content: unknown) {
  if (!isFlashcardType(type)) fail("INVALID", `Unknown flashcard type: ${type}`);
  let parsed: FlashcardContent;
  try {
    parsed = validateContent(type, content);
  } catch (error) {
    const message =
      error instanceof Error && "issues" in error
        ? ((error as { issues: { message: string }[] }).issues[0]?.message ??
          "Invalid flashcard content.")
        : "Invalid flashcard content.";
    fail("INVALID", message);
  }
  const serialized = serializeContent(parsed);
  if (serialized.length > MAX_CONTENT_CHARS) {
    fail("QUOTA", `Flashcard content is limited to ${MAX_CONTENT_CHARS} characters.`);
  }
  let mediaFiles: string[];
  try {
    mediaFiles = contentMediaFileNames(type, parsed);
  } catch (error) {
    fail("INVALID", error instanceof Error ? error.message : "Invalid image.");
  }
  return { type: type as FlashcardType, content: parsed, serialized, mediaFiles };
}

export async function prepareTags(ctx: QueryCtx, libraryId: Id<"libraries">, tags: string[]) {
  const normalized = normalizeTags(tags);
  if (normalized.length > MAX_TAGS_PER_FLASHCARD) {
    fail("INVALID", `A flashcard can have at most ${MAX_TAGS_PER_FLASHCARD} tags.`);
  }
  if (normalized.some((tag) => tag.length > 60)) {
    fail("INVALID", "Tags are limited to 60 characters.");
  }
  return canonicalTags(ctx, libraryId, normalized);
}

export type ValidatedFlashcard = ReturnType<typeof validateFlashcardInput>;

/**
 * The one place a flashcard is created: tags, row, review units, image links,
 * and remembered tag names. Callers validate first (so they can add their own
 * rules, such as the agent's text-only check) and keep the quota checks and
 * `bumpRevision` for themselves, because those depend on the batch they write.
 */
export async function insertFlashcard(
  ctx: MutationCtx,
  args: {
    libraryId: Id<"libraries">;
    deckId: Id<"decks">;
    input: ValidatedFlashcard;
    tags: string[];
    now: number;
    agentConnectionId?: Id<"agentConnections">;
    archived?: boolean;
    /** True when the card was already studied elsewhere, as an accepted review proves access. */
    prerequisiteAccessGranted?: boolean;
  },
) {
  const { libraryId, input, now } = args;
  const tags = await prepareTags(ctx, libraryId, args.tags);
  const id = await ctx.db.insert("flashcards", {
    libraryId,
    deckId: args.deckId,
    ...(args.agentConnectionId ? { agentConnectionId: args.agentConnectionId } : {}),
    type: input.type,
    content: input.serialized,
    tags,
    posX: null,
    posY: null,
    locked: false,
    prerequisiteAccessGranted: args.prerequisiteAccessGranted ?? false,
    archived: args.archived ?? false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  const flashcard = (await ctx.db.get(id))!;
  await reconcileReviewUnits(ctx, flashcard, input.type, input.content, now);
  if (input.mediaFiles.length > 0) await syncFlashcardMedia(ctx, flashcard, input.mediaFiles);
  await rememberTags(ctx, libraryId, tags);
  return id;
}

/**
 * Attach the images a flashcard references. Every reference must name an
 * image already uploaded to this library; nothing from another account (or
 * an unguessable id from one) can be attached.
 */
export async function syncFlashcardMedia(
  ctx: MutationCtx,
  flashcard: { _id: Id<"flashcards">; libraryId: Id<"libraries"> },
  fileNames: string[],
) {
  for (const fileName of fileNames) {
    const media = await ctx.db
      .query("media")
      .withIndex("by_library_file", (q) =>
        q.eq("libraryId", flashcard.libraryId).eq("fileName", fileName),
      )
      .unique();
    if (!media) fail("INVALID", "An image in this flashcard is not in your library.");
  }
  const existing = await ctx.db
    .query("flashcardMedia")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
    .collect();
  const wanted = new Set(fileNames);
  const removed: string[] = [];
  for (const row of existing) {
    if (wanted.has(row.fileName)) {
      wanted.delete(row.fileName);
    } else {
      removed.push(row.fileName);
      await ctx.db.delete(row._id);
    }
  }
  for (const fileName of wanted) {
    await ctx.db.insert("flashcardMedia", {
      libraryId: flashcard.libraryId,
      flashcardId: flashcard._id,
      fileName,
    });
  }
  if (removed.length > 0) {
    // Give an in-progress edit a grace period before unreferenced files go.
    await ctx.scheduler.runAfter(60 * 60_000, internal.media.collectUnreferenced, {
      libraryId: flashcard.libraryId,
      fileNames: removed,
    });
  }
}

/** Remove a flashcard and everything it owns; optionally refresh dependents. */
export async function deleteFlashcardCascade(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  opts: { refreshDependents: boolean },
) {
  const outgoing = await ctx.db
    .query("prereqs")
    .withIndex("by_prereq", (q) => q.eq("prereqId", flashcard._id))
    .collect();
  const incoming = await ctx.db
    .query("prereqs")
    .withIndex("by_dependent", (q) => q.eq("dependentId", flashcard._id))
    .collect();
  for (const edge of [...outgoing, ...incoming]) await ctx.db.delete(edge._id);

  const units = await ctx.db
    .query("reviewUnits")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
    .collect();
  await adjustReviewUnitCount(ctx, flashcard.libraryId, -units.length);
  for (const unit of units) await deleteReviewUnit(ctx, unit._id);
  await syncFlashcardMedia(ctx, flashcard, []);
  await ctx.db.delete(flashcard._id);

  if (opts.refreshDependents && outgoing.length > 0) {
    const settings = new SettingsCache(ctx, flashcard.libraryId);
    await refreshDependentSubgraph(
      ctx,
      outgoing.map((edge) => edge.dependentId),
      settings,
      Date.now(),
    );
  }
}

/** Aggregate a flashcard's units into one tile value (least-learned, soonest). */
function aggregate(units: Doc<"reviewUnits">[]) {
  if (units.length === 0) return { state: 0, due: Date.now() };
  let state = units[0].state;
  let due = units[0].due;
  for (const unit of units) {
    if (unit.state < state) state = unit.state;
    if (unit.due < due) due = unit.due;
  }
  return { state, due };
}

export async function hydrateFlashcard(
  ctx: QueryCtx,
  flashcard: Doc<"flashcards">,
  deckName?: string,
) {
  const units = await ctx.db
    .query("reviewUnits")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
    .collect();
  return hydrateFromUnits(flashcard, units, deckName);
}

/** Tile view of a flashcard from review units the caller already loaded. */
export function hydrateFromUnits(
  flashcard: Doc<"flashcards">,
  units: Doc<"reviewUnits">[],
  deckName?: string,
) {
  const { type, content } = parseFlashcard(flashcard);
  const display = flashcardDisplay(type, content);
  const { state, due } = aggregate(units);
  return {
    id: flashcard._id,
    deckId: flashcard.deckId,
    deckName: deckName ?? "",
    type,
    content,
    tags: flashcard.tags,
    locked: flashcard.locked,
    archived: flashcard.archived,
    posX: flashcard.posX,
    posY: flashcard.posY,
    version: flashcard.version,
    createdAt: flashcard.createdAt,
    updatedAt: flashcard.updatedAt,
    front: display.front,
    back: display.back,
    state,
    due,
  };
}

export type HydratedFlashcard = ReturnType<typeof hydrateFromUnits>;
