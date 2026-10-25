import { v } from "convex/values";
import { generateReviewUnits } from "@armin/core/flashcard-types";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { agentAccess, canAccessDeck, requireDeck } from "./model/agentAuth";
import { agentToolSchemas } from "./model/agentTools";
import { fail } from "./model/errors";
import { MAX_DECKS, MAX_FLASHCARDS, MAX_PREREQS_PER_DECK } from "./model/limits";
import { prepareTags, validateFlashcardInput } from "./model/flashcards";
import {
  bumpRevision,
  reconcileReviewUnits,
  refreshAfterPrereqChange,
  refreshDependentSubgraph,
  rememberTags,
  SettingsCache,
} from "./model/study";

async function revision(ctx: QueryCtx, libraryId: Id<"libraries">) {
  const row = await ctx.db
    .query("libraryCounters")
    .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
    .unique();
  return row?.revision ?? 0;
}

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
  if (!connection.allowEdits && card.agentConnectionId !== connection._id)
    fail(
      "INVALID",
      "Editing existing cards is disabled. Change this connection's permissions in Armin.",
    );
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

/** Validate the whole graph in memory so bounded batch links cannot form cycles. */
function assertAcyclic(edges: { prereqId: string; dependentId: string }[]) {
  const next = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const edge of edges) {
    next.set(edge.prereqId, [...(next.get(edge.prereqId) ?? []), edge.dependentId]);
    indegree.set(edge.prereqId, indegree.get(edge.prereqId) ?? 0);
    indegree.set(edge.dependentId, (indegree.get(edge.dependentId) ?? 0) + 1);
  }
  const queue = [...indegree].filter(([, n]) => n === 0).map(([id]) => id);
  let visited = 0;
  for (let i = 0; i < queue.length; i++) {
    visited++;
    for (const child of next.get(queue[i]!) ?? []) {
      const n = indegree.get(child)! - 1;
      indegree.set(child, n);
      if (n === 0) queue.push(child);
    }
  }
  if (visited !== indegree.size) fail("INVALID", "Prerequisites cannot form a cycle.");
}

export const authenticate = internalQuery({
  args: { tokenHash: v.string(), resource: v.string() },
  handler: async (ctx, args) => {
    const { connection } = await agentAccess(ctx, args.tokenHash);
    if (connection.resource !== args.resource)
      fail("UNAUTHENTICATED", "Token audience does not match this server.");
    return { id: connection._id };
  },
});

export const read = internalQuery({
  args: { tokenHash: v.string(), tool: v.string(), input: v.any() },
  handler: async (ctx, { tokenHash, tool, input }) => {
    const { connection, library } = await agentAccess(ctx, tokenHash);
    if (tool === "list_decks") {
      agentToolSchemas.list_decks.parse(input);
      const decks = await ctx.db
        .query("decks")
        .withIndex("by_library", (q) => q.eq("libraryId", library._id))
        .collect();
      const permitted = [];
      for (const deck of decks)
        if (await canAccessDeck(ctx, connection, deck._id))
          permitted.push({
            id: deck._id,
            name: deck.name,
            description: deck.description,
            version: deck.version,
          });
      return {
        decks: permitted,
        permissions: {
          scope: connection.scope,
          allowCreateDecks: connection.allowCreateDecks,
          allowEdits: connection.allowEdits,
        },
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
          editable: connection.allowEdits || c.agentConnectionId === connection._id,
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
        revision: await revision(ctx, library._id),
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
  const count = await ctx.db
    .query("flashcards")
    .withIndex("by_library", (q) => q.eq("libraryId", connection.libraryId))
    .take(MAX_FLASHCARDS + 1);
  if (count.length + args.cards.length > MAX_FLASHCARDS)
    fail("QUOTA", `A library can hold ${MAX_FLASHCARDS} cards.`);
  let deckId: Id<"decks">;
  if (args.deck.mode === "new") {
    if (!connection.allowCreateDecks)
      fail("INVALID", "Creating decks is disabled for this connection.");
    const decks = await ctx.db
      .query("decks")
      .withIndex("by_library", (q) => q.eq("libraryId", connection.libraryId))
      .take(MAX_DECKS);
    if (decks.length >= MAX_DECKS) fail("QUOTA", "Your library has reached the deck limit.");
    deckId = await ctx.db.insert("decks", {
      libraryId: connection.libraryId,
      name: args.deck.name,
      description: args.deck.description ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agentCreatedDecks", {
      libraryId: connection.libraryId,
      connectionId: connection._id,
      deckId,
    });
  } else {
    const id = ctx.db.normalizeId("decks", args.deck.deckId);
    if (!id) fail("NOT_FOUND", "Deck not found.");
    await requireDeck(ctx, connection, id, true);
    deckId = id;
  }
  const ids = new Map<string, Id<"flashcards">>();
  for (const item of args.cards) {
    if (ids.has(item.key)) fail("INVALID", "Each card key must be unique within the batch.");
    const parsed = textInput(item.card.type, item.card.content);
    const tags = await prepareTags(ctx, connection.libraryId, item.tags ?? []);
    const id = await ctx.db.insert("flashcards", {
      libraryId: connection.libraryId,
      deckId,
      agentConnectionId: connection._id,
      type: parsed.type,
      content: parsed.serialized,
      tags,
      posX: null,
      posY: null,
      locked: false,
      prerequisiteAccessGranted: false,
      archived: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const card = (await ctx.db.get(id))!;
    await reconcileReviewUnits(ctx, card, parsed.type, parsed.content, now);
    await rememberTags(ctx, connection.libraryId, tags);
    ids.set(item.key, id);
  }
  const edges = await ctx.db
    .query("prereqs")
    .withIndex("by_deck", (q) => q.eq("deckId", deckId))
    .collect();
  const newEdges = [];
  const pairs = new Set<string>();
  for (const edge of args.prerequisites ?? []) {
    const prereqId = ids.get(edge.prerequisiteKey);
    const dependentId = ids.get(edge.dependentKey);
    if (!prereqId || !dependentId)
      fail("INVALID", "Prerequisites must refer to card keys in this batch.");
    const key = `${prereqId}:${dependentId}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    newEdges.push({ prereqId, dependentId });
  }
  if (edges.length + newEdges.length > MAX_PREREQS_PER_DECK)
    fail("QUOTA", "Too many prerequisites in this deck.");
  assertAcyclic([...edges, ...newEdges]);
  for (const edge of newEdges)
    await ctx.db.insert("prereqs", { ...edge, deckId, libraryId: connection.libraryId });
  await refreshDependentSubgraph(
    ctx,
    [...ids.values()],
    new SettingsCache(ctx, connection.libraryId),
    now,
  );
  return {
    deckId,
    cards: [...ids].map(([key, id]) => ({ key, id })),
    prerequisiteCount: newEdges.length,
    url: `${process.env.SITE_URL}/deck/${deckId}`,
    summary: `Created ${ids.size} ${ids.size === 1 ? "card" : "cards"} and ${newEdges.length} ${newEdges.length === 1 ? "prerequisite" : "prerequisites"}`,
  };
}

async function editCard(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = agentToolSchemas.update_card.parse(input);
  const card = await cardForEdit(ctx, connection, args.cardId, args.expectedVersion);
  const patch: Partial<Doc<"flashcards">> = {};
  const now = Date.now();
  if (args.card) {
    const parsed = textInput(args.card.type, args.card.content);
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
    patch.type = parsed.type;
    patch.content = parsed.serialized;
    await reconcileReviewUnits(ctx, { ...card, ...patch }, parsed.type, parsed.content, now);
  }
  if (args.tags) {
    patch.tags = await prepareTags(ctx, connection.libraryId, args.tags);
    await rememberTags(ctx, connection.libraryId, patch.tags);
  }
  await ctx.db.patch(card._id, { ...patch, version: card.version + 1, updatedAt: now });
  if (args.card)
    await refreshAfterPrereqChange(
      ctx,
      card._id,
      new SettingsCache(ctx, connection.libraryId),
      now,
    );
  return { deckId: card.deckId, version: card.version + 1, summary: "Updated a card" };
}

async function archiveCard(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = agentToolSchemas.set_card_archived.parse(input);
  const card = await cardForEdit(ctx, connection, args.cardId, args.expectedVersion);
  const now = Date.now();
  await ctx.db.patch(card._id, {
    archived: args.archived,
    version: card.version + 1,
    updatedAt: now,
  });
  const units = await ctx.db
    .query("reviewUnits")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", card._id))
    .collect();
  for (const unit of units)
    await ctx.db.patch(unit._id, {
      archived: args.archived,
      version: unit.version + 1,
      updatedAt: now,
    });
  await refreshAfterPrereqChange(ctx, card._id, new SettingsCache(ctx, connection.libraryId), now);
  return {
    deckId: card.deckId,
    version: card.version + 1,
    summary: args.archived ? "Archived a card" : "Unarchived a card",
  };
}

async function editDeck(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = agentToolSchemas.update_deck.parse(input);
  const id = ctx.db.normalizeId("decks", args.deckId);
  if (!id) fail("NOT_FOUND", "Deck not found.");
  const deck = await requireDeck(ctx, connection, id, true);
  if (deck.version !== args.expectedVersion)
    fail("CONFLICT", "This deck changed elsewhere. Read it again before editing.");
  await ctx.db.patch(id, {
    ...(args.name !== undefined ? { name: args.name } : {}),
    ...(args.description !== undefined ? { description: args.description } : {}),
    version: deck.version + 1,
    updatedAt: Date.now(),
  });
  return { deckId: id, version: deck.version + 1, summary: "Updated deck details" };
}

async function setPrerequisite(
  ctx: MutationCtx,
  connection: Doc<"agentConnections">,
  input: unknown,
) {
  const args = agentToolSchemas.set_prerequisite.parse(input);
  const deckId = ctx.db.normalizeId("decks", args.deckId);
  if (!deckId) fail("NOT_FOUND", "Deck not found.");
  await requireDeck(ctx, connection, deckId, true);
  if ((await revision(ctx, connection.libraryId)) !== args.expectedRevision)
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
  const edges = await ctx.db
    .query("prereqs")
    .withIndex("by_deck", (q) => q.eq("deckId", deckId))
    .collect();
  const existing = edges.find((e) => e.prereqId === prereq._id && e.dependentId === dependent._id);
  if (args.present && !existing) {
    if (edges.length >= MAX_PREREQS_PER_DECK) fail("QUOTA", "Too many prerequisites in this deck.");
    const edge = { prereqId: prereq._id, dependentId: dependent._id };
    assertAcyclic([...edges, edge]);
    await ctx.db.insert("prereqs", { ...edge, libraryId: connection.libraryId, deckId });
  } else if (!args.present && existing) await ctx.db.delete(existing._id);
  await refreshDependentSubgraph(
    ctx,
    [dependent._id],
    new SettingsCache(ctx, connection.libraryId),
    Date.now(),
  );
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

async function moveCard(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = agentToolSchemas.move_card.parse(input);
  const card = await cardForEdit(ctx, connection, args.cardId, args.expectedVersion);
  const target = ctx.db.normalizeId("decks", args.targetDeckId);
  if (!target) fail("NOT_FOUND", "Deck not found.");
  await requireDeck(ctx, connection, target, true);
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
  const now = Date.now();
  await ctx.db.patch(card._id, {
    deckId: target,
    posX: null,
    posY: null,
    version: card.version + 1,
    updatedAt: now,
  });
  const units = await ctx.db
    .query("reviewUnits")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", card._id))
    .collect();
  for (const unit of units)
    await ctx.db.patch(unit._id, { deckId: target, version: unit.version + 1, updatedAt: now });
  await refreshAfterPrereqChange(ctx, card._id, new SettingsCache(ctx, connection.libraryId), now);
  return { deckId: target, version: card.version + 1, summary: "Moved a card" };
}

export const write = internalMutation({
  args: { tokenHash: v.string(), tool: v.string(), input: v.any(), fingerprint: v.string() },
  handler: async (ctx, { tokenHash, tool, input, fingerprint }) => {
    const { connection } = await agentAccess(ctx, tokenHash);
    const key = tool as keyof typeof agentToolSchemas;
    const schema = agentToolSchemas[key];
    if (!schema) fail("INVALID", "Unknown tool.");
    const parsed = schema.parse(input);
    if (!("requestId" in parsed)) fail("INVALID", "This is not a write tool.");
    const previous = await ctx.db
      .query("agentRequests")
      .withIndex("by_connection_request", (q) =>
        q.eq("connectionId", connection._id).eq("requestId", parsed.requestId),
      )
      .unique();
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        fail("INVALID", "This request ID was already used for different input. Use a new ID.");
      const saved = previous.result as { deckId: Id<"decks"> };
      await requireDeck(ctx, connection, saved.deckId);
      return previous.result;
    }
    // Bound write volume even when a client repeatedly edits one card.
    const rateKey = `write:${connection._id}`;
    const bucket = await ctx.db
      .query("agentRateLimits")
      .withIndex("by_key", (q) => q.eq("key", rateKey))
      .unique();
    if (bucket && bucket.expiresAt > Date.now()) {
      if (bucket.count >= 120)
        fail("QUOTA", "This connection reached its hourly limit of 120 writes. Try later.");
      await ctx.db.patch(bucket._id, { count: bucket.count + 1 });
    } else if (bucket)
      await ctx.db.patch(bucket._id, { count: 1, expiresAt: Date.now() + 3_600_000 });
    else
      await ctx.db.insert("agentRateLimits", {
        key: rateKey,
        libraryId: connection.libraryId,
        count: 1,
        expiresAt: Date.now() + 3_600_000,
      });
    const operations = {
      save_cards: saveCards,
      update_card: editCard,
      set_card_archived: archiveCard,
      update_deck: editDeck,
      set_prerequisite: setPrerequisite,
      move_card: moveCard,
    };
    const operation = operations[tool as keyof typeof operations];
    if (!operation) fail("INVALID", "Unknown write tool.");
    const result = await operation(ctx, connection, input);
    const now = Date.now();
    await bumpRevision(ctx, connection.libraryId);
    await ctx.db.patch(connection._id, { lastUsedAt: now });
    await ctx.db.insert("agentRequests", {
      libraryId: connection.libraryId,
      connectionId: connection._id,
      requestId: parsed.requestId,
      fingerprint,
      result,
      createdAt: now,
    });
    await ctx.db.insert("agentActivity", {
      libraryId: connection.libraryId,
      connectionId: connection._id,
      clientName: connection.name,
      summary: result.summary,
      deckId: result.deckId,
      createdAt: now,
    });
    return result;
  },
});
