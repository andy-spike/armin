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
import { requestGeneration } from "./concepts";
import { fail } from "./errors";
import { MAX_CONTENT_CHARS, MAX_TAG_CHARS, MAX_TAGS_PER_FLASHCARD } from "./limits";
import { settleVariants } from "./variantAllowance";
import {
  adjustReviewUnitCount,
  canonicalTags,
  deleteReviewUnit,
  parseFlashcard,
  reconcileReviewUnits,
  refreshAfterPrereqChange,
  refreshDependentSubgraph,
  rememberTags,
  SettingsCache,
  type TagCache,
} from "./study";

export function validateFlashcardInput(
  type: string,
  content: unknown,
  options: { concept?: boolean } = {},
) {
  if (!isFlashcardType(type)) fail("INVALID", `Unknown flashcard type: ${type}`);
  if (type === "concept" && !options.concept)
    fail("INVALID", "Concept cards can only be created and edited in Armin's card editor.");
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

export async function prepareTags(
  ctx: QueryCtx,
  libraryId: Id<"libraries">,
  tags: string[],
  cache?: TagCache,
) {
  const normalized = normalizeTags(tags);
  if (normalized.length > MAX_TAGS_PER_FLASHCARD) {
    fail("INVALID", `A flashcard can have at most ${MAX_TAGS_PER_FLASHCARD} tags.`);
  }
  if (normalized.some((tag) => tag.length > MAX_TAG_CHARS)) {
    fail("INVALID", `Tags are limited to ${MAX_TAG_CHARS} characters.`);
  }
  return canonicalTags(ctx, libraryId, normalized, cache);
}

export type ValidatedFlashcard = ReturnType<typeof validateFlashcardInput>;

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
    prerequisiteAccessGranted?: boolean;
    tagCache?: TagCache;
  },
) {
  const { libraryId, input, now } = args;
  const tags = await prepareTags(ctx, libraryId, args.tags, args.tagCache);
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
  await rememberTags(ctx, libraryId, tags, args.tagCache);
  if (input.type === "concept") await requestGeneration(ctx, flashcard, now);
  return id;
}

export async function editFlashcard(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  change: { input?: ValidatedFlashcard; tags?: string[] },
  now: number,
) {
  const { input } = change;
  const patch: Partial<Doc<"flashcards">> = {};
  if (input) {
    patch.type = input.type;
    patch.content = input.serialized;
    await reconcileReviewUnits(ctx, { ...flashcard, ...patch }, input.type, input.content, now);
    await syncFlashcardMedia(ctx, flashcard, input.mediaFiles);
  }
  if (change.tags) {
    patch.tags = await prepareTags(ctx, flashcard.libraryId, change.tags);
    await rememberTags(ctx, flashcard.libraryId, patch.tags);
  }
  const version = flashcard.version + 1;
  await ctx.db.patch(flashcard._id, { ...patch, version, updatedAt: now });
  if (input) {
    const settings = new SettingsCache(ctx, flashcard.libraryId);
    await refreshAfterPrereqChange(ctx, flashcard._id, settings, now);
  }
  return version;
}

export async function setFlashcardArchived(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  archived: boolean,
  now: number,
) {
  if (flashcard.archived === archived) return flashcard.version;
  const version = flashcard.version + 1;
  await ctx.db.patch(flashcard._id, { archived, version, updatedAt: now });
  for (const unit of await unitsOf(ctx, flashcard._id)) {
    await ctx.db.patch(unit._id, { archived, version: unit.version + 1, updatedAt: now });
  }
  const settings = new SettingsCache(ctx, flashcard.libraryId);
  await refreshAfterPrereqChange(ctx, flashcard._id, settings, now);
  return version;
}

async function deletePrereqEdges(ctx: MutationCtx, flashcardId: Id<"flashcards">) {
  const outgoing = await ctx.db
    .query("prereqs")
    .withIndex("by_prereq", (q) => q.eq("prereqId", flashcardId))
    .collect();
  const incoming = await ctx.db
    .query("prereqs")
    .withIndex("by_dependent", (q) => q.eq("dependentId", flashcardId))
    .collect();
  for (const edge of [...outgoing, ...incoming]) await ctx.db.delete(edge._id);
  return outgoing.map((edge) => edge.dependentId);
}

export async function moveFlashcard(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  targetDeckId: Id<"decks">,
  now: number,
) {
  if (flashcard.deckId === targetDeckId) return flashcard.version;
  const dependents = await deletePrereqEdges(ctx, flashcard._id);
  const version = flashcard.version + 1;
  await ctx.db.patch(flashcard._id, {
    deckId: targetDeckId,
    posX: null,
    posY: null,
    version,
    updatedAt: now,
  });
  for (const unit of await unitsOf(ctx, flashcard._id)) {
    await ctx.db.patch(unit._id, {
      deckId: targetDeckId,
      version: unit.version + 1,
      updatedAt: now,
    });
  }
  const settings = new SettingsCache(ctx, flashcard.libraryId);
  await refreshDependentSubgraph(ctx, [flashcard._id, ...dependents], settings, now);
  return version;
}

function unitsOf(ctx: QueryCtx, flashcardId: Id<"flashcards">) {
  return ctx.db
    .query("reviewUnits")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcardId))
    .collect();
}

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
    await ctx.scheduler.runAfter(60 * 60_000, internal.media.collectUnreferenced, {
      libraryId: flashcard.libraryId,
      fileNames: removed,
    });
  }
}

export async function deleteFlashcardCascade(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  opts: { refreshDependents: boolean },
) {
  const dependents = await deletePrereqEdges(ctx, flashcard._id);

  const units = await ctx.db
    .query("reviewUnits")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
    .collect();
  await adjustReviewUnitCount(ctx, flashcard.libraryId, -units.length);
  for (const unit of units) await deleteReviewUnit(ctx, unit._id);
  await syncFlashcardMedia(ctx, flashcard, []);
  if (flashcard.conceptPool?.status === "generating")
    await settleVariants(ctx, flashcard.conceptPool.reserved, 0);
  await ctx.db.delete(flashcard._id);
  if (flashcard.type === "concept")
    await ctx.scheduler.runAfter(0, internal.deletion.cleanupConceptVariants, {
      flashcardId: flashcard._id,
    });

  if (opts.refreshDependents && dependents.length > 0) {
    const settings = new SettingsCache(ctx, flashcard.libraryId);
    await refreshDependentSubgraph(ctx, dependents, settings, Date.now());
  }
}

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

export function hydrateFromUnits(
  flashcard: Doc<"flashcards">,
  units: Doc<"reviewUnits">[],
  deckName?: string,
) {
  return hydrateTile(flashcard, aggregate(units), deckName);
}

export function hydrateTile(
  flashcard: Doc<"flashcards">,
  { state, due, lowOnVariants }: { state: number; due: number; lowOnVariants?: boolean },
  deckName?: string,
) {
  const { type, content } = parseFlashcard(flashcard);
  const display = flashcardDisplay(type, content);
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
    lowOnVariants: lowOnVariants ?? false,
  };
}

export type HydratedFlashcard = ReturnType<typeof hydrateFromUnits>;
