import { v } from "convex/values";
import { generateReviewUnits } from "@armin/core/flashcard-types";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { agentAccess, agentUser, requireDeck } from "./model/agentAuth";
import { agentToolSchemas } from "./model/agentTools";
import { fail } from "./model/errors";
import { countAgentCards, runAgentWrite } from "./model/agentWrites";
import { insertDeck, updateDeckDetails } from "./model/decks";
import {
  editFlashcard,
  insertFlashcard,
  moveFlashcard,
  setFlashcardArchived,
  validateFlashcardInput,
  type ValidatedFlashcard,
} from "./model/flashcards";
import { linkPrerequisites, unlinkPrerequisite } from "./model/prereqs";
import { bumpRevision, libraryRevision, type TagCache } from "./model/study";
import { checkCapacity } from "./model/usage";

async function cardForEdit(
  ctx: QueryCtx,
  connection: Doc<"agentConnections">,
  id: string,
  expectedVersion: number,
) {
  const cardId = ctx.db.normalizeId("flashcards", id);
  const card = cardId ? await ctx.db.get(cardId) : null;
  if (!card || card.libraryId !== connection.libraryId) fail("NOT_FOUND", "Card not found.");
  await requireDeck(ctx, connection, card.deckId);
  if (card.version !== expectedVersion)
    fail(
      "CONFLICT",
      "This card changed elsewhere. Read it again and ask before replacing the newer edit.",
    );
  return card;
}

function textInput(type: string, content: unknown) {
  const input = validateFlashcardInput(type, content);
  if (type === "image_occlusion" || input.mediaFiles.length)
    fail("INVALID", "Agent authoring currently supports text cards only. Use Armin for images.");
  return input;
}

export const read = internalQuery({
  args: { user: agentUser, tool: v.string(), input: v.any() },
  handler: async (ctx, { user, tool, input }) => {
    const { connection, library } = await agentAccess(ctx, user);
    if (tool === "list_decks") {
      agentToolSchemas.list_decks.parse(input);
      const decks = await ctx.db
        .query("decks")
        .withIndex("by_library", (q) => q.eq("libraryId", library._id))
        .collect();
      return {
        decks: decks
          .filter((deck) => !deck.staging)
          .map((deck) => ({
            id: deck._id,
            name: deck.name,
            description: deck.description,
            version: deck.version,
          })),
        retryWindowDays: 7,
      };
    }
    if (tool === "read_deck") {
      const args = agentToolSchemas.read_deck.parse(input);
      const id = ctx.db.normalizeId("decks", args.deckId);
      if (!id) fail("NOT_FOUND", "Deck not found.");
      const deck = await requireDeck(ctx, connection, id);
      const page = await ctx.db
        .query("flashcards")
        .withIndex("by_deck", (q) => q.eq("deckId", id))
        .paginate({ cursor: args.cursor ?? null, numItems: args.limit ?? 20 });
      return {
        deck: { id, name: deck.name, description: deck.description, version: deck.version },
        cards: page.page.map((c) => ({
          id: c._id,
          type: c.type,
          content: JSON.parse(c.content) as unknown,
          tags: c.tags,
          archived: c.archived,
          version: c.version,
        })),
        nextCursor: page.isDone ? null : page.continueCursor,
      };
    }
    if (tool === "read_prerequisites") {
      const args = agentToolSchemas.read_prerequisites.parse(input);
      const id = ctx.db.normalizeId("decks", args.deckId);
      if (!id) fail("NOT_FOUND", "Deck not found.");
      await requireDeck(ctx, connection, id);
      const edges = await ctx.db
        .query("prereqs")
        .withIndex("by_deck", (q) => q.eq("deckId", id))
        .collect();
      return {
        revision: await libraryRevision(ctx, library._id),
        prerequisites: edges.map((e) => ({
          prerequisiteId: e.prereqId,
          dependentId: e.dependentId,
        })),
      };
    }
    fail("INVALID", "Unknown read tool.");
  },
});

async function saveCards(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = agentToolSchemas.save_cards.parse(input);
  const now = Date.now();
  await checkCapacity(ctx, connection.libraryId, {
    decks: args.deck.mode === "new" ? 1 : 0,
    flashcards: args.cards.length,
  });
  await countAgentCards(ctx, connection.libraryId, args.cards.length);
  let deck: Doc<"decks">;
  if (args.deck.mode === "new") {
    const deckId = await insertDeck(ctx, {
      libraryId: connection.libraryId,
      name: args.deck.name,
      description: args.deck.description,
      now,
    });
    await ctx.db.insert("agentCreatedDecks", {
      libraryId: connection.libraryId,
      connectionId: connection._id,
      deckId,
    });
    deck = (await ctx.db.get(deckId))!;
  } else {
    const id = ctx.db.normalizeId("decks", args.deck.deckId);
    if (!id) fail("NOT_FOUND", "Deck not found.");
    deck = await requireDeck(ctx, connection, id);
  }
  const ids = new Map<string, Id<"flashcards">>();
  const tagCache: TagCache = new Map();
  for (const item of args.cards) {
    if (ids.has(item.key)) fail("INVALID", "Each card key must be unique within the batch.");
    const parsed = textInput(item.card.type, item.card.content);
    const id = await insertFlashcard(ctx, {
      libraryId: connection.libraryId,
      deckId: deck._id,
      input: parsed,
      tags: item.tags ?? [],
      now,
      agentConnectionId: connection._id,
      tagCache,
    });
    ids.set(item.key, id);
  }
  const links = (args.prerequisites ?? []).map((edge) => {
    const prereqId = ids.get(edge.prerequisiteKey);
    const dependentId = ids.get(edge.dependentKey);
    if (!prereqId || !dependentId)
      fail("INVALID", "Prerequisites must refer to card keys in this batch.");
    return { prereqId, dependentId };
  });
  const added = await linkPrerequisites(ctx, deck, links, now);
  return {
    deckId: deck._id,
    cards: [...ids].map(([key, id]) => ({ key, id })),
    prerequisiteCount: added.length,
    url: `${process.env.SITE_URL}/deck/${deck._id}`,
    summary: `Created ${ids.size} ${ids.size === 1 ? "card" : "cards"} and ${added.length} ${added.length === 1 ? "prerequisite" : "prerequisites"}`,
  };
}

/**
 * Assistants may change a card's text and tags, but not remove review items
 * (and their history) or touch cards with images; those edits stay in Armin.
 */
async function editCard(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = agentToolSchemas.update_card.parse(input);
  const card = await cardForEdit(ctx, connection, args.cardId, args.expectedVersion);
  let parsed: ValidatedFlashcard | undefined;
  if (args.card) {
    parsed = textInput(args.card.type, args.card.content);
    const newKeys = new Set(generateReviewUnits(parsed.type, parsed.content).map((u) => u.subKey));
    const units = await ctx.db
      .query("reviewUnits")
      .withIndex("by_flashcard", (q) => q.eq("flashcardId", card._id))
      .collect();
    if (units.some((u) => !newKeys.has(u.subKey)))
      fail(
        "INVALID",
        "This edit would remove review items and their history. Make this structural change in Armin's editor.",
      );
    const media = await ctx.db
      .query("flashcardMedia")
      .withIndex("by_flashcard", (q) => q.eq("flashcardId", card._id))
      .first();
    if (media) fail("INVALID", "Edit cards containing images in Armin.");
  }
  const version = await editFlashcard(ctx, card, { input: parsed, tags: args.tags }, Date.now());
  return { deckId: card.deckId, version, summary: "Updated a card" };
}

async function archiveCard(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = agentToolSchemas.set_card_archived.parse(input);
  const card = await cardForEdit(ctx, connection, args.cardId, args.expectedVersion);
  const version = await setFlashcardArchived(ctx, card, args.archived, Date.now());
  return {
    deckId: card.deckId,
    version,
    summary: args.archived ? "Archived a card" : "Unarchived a card",
  };
}

async function editDeck(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = agentToolSchemas.update_deck.parse(input);
  const id = ctx.db.normalizeId("decks", args.deckId);
  if (!id) fail("NOT_FOUND", "Deck not found.");
  const deck = await requireDeck(ctx, connection, id);
  if (deck.version !== args.expectedVersion)
    fail("CONFLICT", "This deck changed elsewhere. Read it again before editing.");
  const version = await updateDeckDetails(ctx, deck, args, Date.now());
  return { deckId: id, version, summary: "Updated deck details" };
}

async function setPrerequisite(
  ctx: MutationCtx,
  connection: Doc<"agentConnections">,
  input: unknown,
) {
  const args = agentToolSchemas.set_prerequisite.parse(input);
  const deckId = ctx.db.normalizeId("decks", args.deckId);
  if (!deckId) fail("NOT_FOUND", "Deck not found.");
  const deck = await requireDeck(ctx, connection, deckId);
  if ((await libraryRevision(ctx, connection.libraryId)) !== args.expectedRevision)
    fail("CONFLICT", "The library changed. Read the graph again before changing prerequisites.");
  const prereq = await cardForEdit(
    ctx,
    connection,
    args.prerequisiteId,
    (await getCard(ctx, args.prerequisiteId)).version,
  );
  const dependent = await cardForEdit(
    ctx,
    connection,
    args.dependentId,
    (await getCard(ctx, args.dependentId)).version,
  );
  if (prereq.deckId !== deckId || dependent.deckId !== deckId)
    fail("INVALID", "Prerequisites must stay in the same authorized deck.");
  const now = Date.now();
  if (args.present) {
    await linkPrerequisites(ctx, deck, [{ prereqId: prereq._id, dependentId: dependent._id }], now);
  } else {
    const edge = await ctx.db
      .query("prereqs")
      .withIndex("by_pair", (q) => q.eq("prereqId", prereq._id).eq("dependentId", dependent._id))
      .unique();
    if (edge) await unlinkPrerequisite(ctx, edge, now);
  }
  return {
    deckId,
    revision: args.expectedRevision + 1,
    summary: args.present ? "Added a prerequisite" : "Removed a prerequisite",
  };
}

async function getCard(ctx: QueryCtx, id: string) {
  const normalized = ctx.db.normalizeId("flashcards", id);
  const card = normalized ? await ctx.db.get(normalized) : null;
  if (!card) fail("NOT_FOUND", "Card not found.");
  return card;
}

/**
 * Assistants may not silently cut a learner's prerequisite chain, so a card
 * with links must have them removed explicitly before it moves.
 */
async function moveCard(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = agentToolSchemas.move_card.parse(input);
  const card = await cardForEdit(ctx, connection, args.cardId, args.expectedVersion);
  const target = ctx.db.normalizeId("decks", args.targetDeckId);
  if (!target) fail("NOT_FOUND", "Deck not found.");
  await requireDeck(ctx, connection, target);
  const incoming = await ctx.db
    .query("prereqs")
    .withIndex("by_dependent", (q) => q.eq("dependentId", card._id))
    .first();
  const outgoing = await ctx.db
    .query("prereqs")
    .withIndex("by_prereq", (q) => q.eq("prereqId", card._id))
    .first();
  if (incoming || outgoing)
    fail(
      "INVALID",
      "This card has prerequisites or dependents. Moving would remove those links; discuss and explicitly remove them first.",
    );
  const version = await moveFlashcard(ctx, card, target, Date.now());
  return { deckId: target, version, summary: "Moved a card" };
}

const operations = {
  save_cards: saveCards,
  update_card: editCard,
  set_card_archived: archiveCard,
  update_deck: editDeck,
  set_prerequisite: setPrerequisite,
  move_card: moveCard,
};

export const write = internalMutation({
  args: { user: agentUser, tool: v.string(), input: v.any(), fingerprint: v.string() },
  handler: async (ctx, { user, tool, input, fingerprint }) => {
    const { connection } = await agentAccess(ctx, user);
    const key = tool as keyof typeof agentToolSchemas;
    const schema = agentToolSchemas[key];
    if (!schema) fail("INVALID", "Unknown tool.");
    const parsed = schema.parse(input);
    if (!("requestId" in parsed)) fail("INVALID", "This is not a write tool.");
    const operation = operations[tool as keyof typeof operations];
    if (!operation) fail("INVALID", "Unknown write tool.");
    return runAgentWrite(
      ctx,
      connection,
      { requestId: parsed.requestId, fingerprint },
      {
        // A retry still needs access to the deck the first attempt wrote.
        replay: async (saved) => {
          await requireDeck(ctx, connection, saved.deckId);
          return saved;
        },
        write: async () => {
          const result: { deckId: Id<"decks">; summary: string } = await operation(
            ctx,
            connection,
            input,
          );
          await bumpRevision(ctx, connection.libraryId);
          await ctx.db.insert("agentActivity", {
            libraryId: connection.libraryId,
            connectionId: connection._id,
            clientName: connection.name,
            summary: result.summary,
            deckId: result.deckId,
            createdAt: Date.now(),
          });
          return result;
        },
      },
    );
  },
});
