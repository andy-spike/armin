import { v } from "convex/values";
import { generateReviewUnits } from "@armin/core/flashcard-types";
import { Rating } from "ts-fsrs";
import { STATS_RECENT_DAYS } from "@armin/core/stats";
import { formatInterval } from "@armin/core/study";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { activeDeckIds } from "./model/access";
import { agentAccess, agentUser, requireDeck } from "./model/agentAuth";
import { agentToolScopes, agentToolSchemas, type AgentToolName } from "./model/agentTools";
import { parseAgentInput } from "./model/agentInput";
import {
  cardPreview,
  deckLink,
  deckUrl,
  plainText,
  type AgentWriteToolResult,
} from "./model/agentResults";
import { cardDetails } from "./model/cardDetails";
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
import { overviewSnapshot, WEAKEST_MIN_REVIEWS, weakestDecks } from "./model/overview";
import { graphRevision, linkPrerequisites, unlinkPrerequisite } from "./model/prereqs";
import { dueCounts, selectSession, toQueueItems } from "./model/queue";
import { rateReviewUnit } from "./model/review";
import { bumpRevision, parseFlashcard, type TagCache } from "./model/study";
import { checkCapacity } from "./model/usage";
import { searchSummaries } from "./flashcards";

const MAX_DECKS = 200;
const MAX_SEARCH_SCAN = 1000;
const MAX_TEXT_LINES = 40;
const CARD_DETAIL_REVIEWS = 10;

const RATINGS = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
} as const;

async function cardForAccess(ctx: QueryCtx, connection: Doc<"agentConnections">, id: string) {
  const cardId = ctx.db.normalizeId("flashcards", id);
  const card = cardId ? await ctx.db.get(cardId) : null;
  if (!card || card.libraryId !== connection.libraryId) fail("NOT_FOUND", "Card not found.");
  await requireDeck(ctx, connection, card.deckId);
  return card;
}

async function cardForEdit(
  ctx: QueryCtx,
  connection: Doc<"agentConnections">,
  id: string,
  expectedVersion: number,
) {
  const card = await cardForAccess(ctx, connection, id);
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

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function deckLine(deck: {
  id: string;
  name: string;
  version: number;
  cardCount: number;
  dueCount: number;
}) {
  return `- ${deck.name} (id ${deck.id}, v${deck.version}): ${plural(deck.cardCount, "card", "cards")}, ${deck.dueCount} due`;
}

function cardLine(card: {
  id: string;
  version: number;
  type: string;
  preview: string;
  archived: boolean;
  deckId: string;
}) {
  return `- ${card.id} v${card.version} · ${card.type}${card.archived ? " · archived" : ""} · ${card.preview} · deck ${card.deckId}`;
}

function listedText(
  header: string,
  lines: string[],
  more = "Narrow the request or read the next page.",
) {
  const shown = lines.slice(0, MAX_TEXT_LINES);
  if (lines.length > shown.length) shown.push(`… and ${lines.length - shown.length} more. ${more}`);
  return [header, ...shown].join("\n");
}

function cardView(card: Doc<"flashcards">, deckName: string) {
  const { type, content } = parseFlashcard(card);
  return {
    id: card._id,
    deckId: card.deckId,
    deckName,
    type,
    preview: cardPreview(type, content),
    tags: card.tags,
    archived: card.archived,
    version: card.version,
    url: deckUrl(card.deckId),
  };
}

async function searchCards(
  ctx: QueryCtx,
  connection: Doc<"agentConnections">,
  library: Doc<"libraries">,
  input: unknown,
) {
  const args = parseAgentInput(agentToolSchemas.search_cards, input);
  const deckId = args.deckId ? ctx.db.normalizeId("decks", args.deckId) : null;
  if (args.deckId && !deckId) fail("NOT_FOUND", "Deck not found.");
  const deck = deckId ? await requireDeck(ctx, connection, deckId) : null;
  const tag = args.tag?.toLocaleLowerCase();
  const limit = args.limit ?? 20;
  const decks = new Map<Id<"decks">, Doc<"decks"> | null>();
  const cards = [];
  let hasMore = false;
  let scanned = 0;
  for await (const row of searchSummaries(ctx, library._id, deck?._id ?? null, args.query)) {
    if (cards.length >= limit || scanned >= MAX_SEARCH_SCAN) {
      hasMore = true;
      break;
    }
    scanned++;
    if (!args.includeArchived && row.archived) continue;
    if (tag && !row.tagKeys.includes(tag)) continue;
    if (!decks.has(row.deckId)) decks.set(row.deckId, await ctx.db.get(row.deckId));
    const owner = decks.get(row.deckId);
    if (!owner || owner.staging) continue;
    const card = await ctx.db.get(row.flashcardId);
    if (!card) continue;
    cards.push(cardView(card, owner.name));
  }
  const scope = deck ? ` in "${deck.name}"` : "";
  const tagNote = tag ? ` tagged "${args.tag}"` : "";
  const header = cards.length
    ? `${plural(cards.length, "card", "cards")}${hasMore ? " or more" : ""} matching "${args.query}"${scope}${tagNote}:`
    : `No cards matching "${args.query}"${scope}${tagNote}. Try fewer words or set includeArchived to true.`;
  const notes = hasMore
    ? ["More matches may exist; raise limit (max 100) or narrow the query."]
    : [];
  const text = [
    listedText(header, cards.map(cardLine), "Narrow the query, deck, or tag, or lower limit."),
    ...notes,
  ].join("\n");
  const links = [...decks.values()]
    .filter((owner): owner is Doc<"decks"> => Boolean(owner))
    .slice(0, 5)
    .map(deckLink);
  return { value: { cards, hasMore }, text, links };
}

export const read = internalQuery({
  args: { user: agentUser, scope: v.string(), tool: v.string(), input: v.any() },
  handler: async (ctx, { user, scope, tool, input }) => {
    const key = tool as AgentToolName;
    const required = agentToolScopes[key];
    if (!required) fail("INVALID", "Unknown tool.");
    if (scope !== required) fail("INVALID", "This tool's permission check does not match.");
    const { connection, library } = await agentAccess(ctx, user, required);
    if (tool === "list_decks") {
      const args = parseAgentInput(agentToolSchemas.list_decks, input);
      const now = Date.now();
      const page = await ctx.db
        .query("decks")
        .withIndex("by_library", (q) => q.eq("libraryId", library._id))
        .paginate({ cursor: args.cursor ?? null, numItems: MAX_DECKS });
      const decks = page.page.filter((deck) => !deck.staging);
      const counters = await Promise.all(
        decks.map((deck) =>
          ctx.db
            .query("deckCounters")
            .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
            .unique(),
        ),
      );
      const due = (await dueCounts(ctx, library, now)).perDeck;
      const items = decks.map((deck, index) => ({
        id: deck._id,
        name: deck.name,
        description: deck.description,
        version: deck.version,
        cardCount: counters[index]?.active ?? 0,
        dueCount: due[deck._id] ?? 0,
        url: deckUrl(deck._id),
      }));
      const nextCursor = page.isDone ? null : page.continueCursor;
      const cursorLine = nextCursor
        ? `nextCursor: ${nextCursor}`
        : "nextCursor: null (end of list)";
      const header = items.length
        ? `${plural(items.length, "deck", "decks")}:`
        : nextCursor
          ? "No decks on this page."
          : "No decks yet. save_cards with deck mode new creates one.";
      return {
        value: { decks: items, nextCursor, retryWindowDays: 7 },
        text: items.length
          ? `${listedText(
              header,
              items.map(deckLine),
              "The full list is in structuredContent; ask about a deck by name.",
            )}\n${cursorLine}`
          : nextCursor
            ? `${header}\n${cursorLine}`
            : header,
        links: items
          .slice(0, 5)
          .map((deck) => ({ uri: deck.url, name: deck.name, description: "Open in Armin" })),
      };
    }
    if (tool === "search_cards") return searchCards(ctx, connection, library, input);
    if (tool === "read_deck") {
      const args = parseAgentInput(agentToolSchemas.read_deck, input);
      const format = args.format ?? "full";
      const limit = args.limit ?? 20;
      if (format === "full" && limit > 20)
        fail(
          "INVALID",
          "Full format reads at most 20 cards per page. Use format summary to read up to 100 per page.",
        );
      const id = ctx.db.normalizeId("decks", args.deckId);
      if (!id) fail("NOT_FOUND", "Deck not found.");
      const deck = await requireDeck(ctx, connection, id);
      const edges = await ctx.db
        .query("prereqs")
        .withIndex("by_deck", (q) => q.eq("deckId", id))
        .collect();
      const revision = graphRevision(deck);
      const prerequisites = edges.map((edge) => ({
        prerequisiteId: edge.prereqId,
        dependentId: edge.dependentId,
      }));
      const page = await ctx.db
        .query("flashcards")
        .withIndex("by_deck", (q) => q.eq("deckId", id))
        .paginate({ cursor: args.cursor ?? null, numItems: limit });
      const visible =
        args.includeArchived === false ? page.page.filter((card) => !card.archived) : page.page;
      const view = {
        id,
        name: deck.name,
        description: deck.description,
        version: deck.version,
        url: deckUrl(id),
      };
      const hidden = page.page.length - visible.length;
      const header = `Deck "${deck.name}" (id ${id}, v${deck.version}), ${format} format, ${plural(visible.length, "card", "cards")} shown${hidden ? ` (${hidden} archived hidden)` : ""}:`;
      const cursorLine = page.isDone
        ? "nextCursor: null (end of deck)"
        : `nextCursor: ${page.continueCursor}`;
      const graphLine = `Prerequisites: revision ${revision}, ${plural(edges.length, "link", "links")}.`;
      if (format === "summary") {
        const cards = visible.map((card) => cardView(card, deck.name));
        return {
          value: {
            deck: view,
            format: "summary",
            cards,
            revision,
            prerequisites,
            nextCursor: page.isDone ? null : page.continueCursor,
          },
          text: `${listedText(header, cards.map(cardLine))}\n${graphLine}\n${cursorLine}`,
          links: [deckLink(deck)],
        };
      }
      const parsed = visible.map((card) => ({ card, ...parseFlashcard(card) }));
      return {
        value: {
          deck: view,
          format: "full",
          cards: parsed.map(({ card, type, content }) => ({
            id: card._id,
            type,
            content,
            tags: card.tags,
            archived: card.archived,
            version: card.version,
          })),
          revision,
          prerequisites,
          nextCursor: page.isDone ? null : page.continueCursor,
        },
        text: `${listedText(
          header,
          parsed.map(
            ({ card, type, content }) =>
              `- ${card._id} v${card.version} · ${type}${card.archived ? " · archived" : ""} · ${cardPreview(type, content)}`,
          ),
        )}\n${graphLine}\n${cursorLine}`,
        links: [deckLink(deck)],
      };
    }
    if (tool === "get_study_overview") {
      const args = parseAgentInput(agentToolSchemas.get_study_overview, input);
      let deck: Doc<"decks"> | null = null;
      if (args.deckId) {
        const id = ctx.db.normalizeId("decks", args.deckId);
        if (!id) fail("NOT_FOUND", "Deck not found.");
        deck = await requireDeck(ctx, connection, id);
      }
      const now = Date.now();
      const snapshot = await overviewSnapshot(ctx, library, deck?._id ?? null, now);
      const due = await dueCounts(ctx, library, now);
      const dueNow = deck ? (due.perDeck[deck._id] ?? 0) : due.due;
      const decks = deck ? new Set([deck._id]) : await activeDeckIds(ctx, library._id);
      const weakest = await weakestDecks(ctx, library, decks, now);
      const retention = { ...snapshot.retention, days: STATS_RECENT_DAYS };
      const value = {
        serverNow: now,
        deck: deck ? { id: deck._id, name: deck.name, url: deckUrl(deck._id) } : null,
        dueNow,
        dueToday: snapshot.forecast.days[0]?.count ?? 0,
        newAvailable: snapshot.states.newCount,
        streak: snapshot.streak,
        retention,
        states: snapshot.states,
        weakestDecks: weakest.map((row) => ({
          deckId: row.deckId,
          name: row.name,
          reviews: row.reviews,
          retained: row.retained,
          ratio: row.ratio,
          url: deckUrl(row.deckId),
        })),
        pending: snapshot.pending,
        truncated: snapshot.truncated,
      };
      const scope = deck ? `deck "${deck.name}"` : "the library";
      const retentionText =
        retention.ratio == null
          ? `no reviews in the last ${STATS_RECENT_DAYS} days`
          : `${Math.round(retention.ratio * 100)}% retained over the last ${STATS_RECENT_DAYS} days (${retention.retained} of ${retention.reviews} reviews)`;
      const lines = [
        `Study overview for ${scope}:`,
        `- Due now: ${dueNow} (including new); scheduled reviews due today: ${value.dueToday}; new available: ${value.newAvailable}`,
        `- Retention: ${retentionText}; streak ${value.streak.current} days (longest ${value.streak.longest}).`,
        `- Review units: ${value.states.newCount} new, ${value.states.learningCount} learning, ${value.states.reviewCount} review, ${value.states.relearningCount} relearning; ${value.states.lockedCount} locked, ${value.states.archivedCount} archived.`,
      ];
      if (value.weakestDecks.length) {
        lines.push("Weakest decks by recent retention:");
        for (const row of value.weakestDecks)
          lines.push(
            `- ${row.name} (${row.deckId}): ${Math.round(row.ratio * 100)}% of ${row.reviews} reviews retained · ${row.url}`,
          );
      } else {
        lines.push(
          `No deck has at least ${WEAKEST_MIN_REVIEWS} reviews in the last ${STATS_RECENT_DAYS} days yet.`,
        );
      }
      if (snapshot.pending) lines.push("Statistics are still being prepared; counts may lag.");
      return {
        value,
        text: lines.join("\n"),
        links: [
          ...(deck ? [deckLink(deck)] : []),
          ...value.weakestDecks
            .filter((row) => row.deckId !== deck?._id)
            .slice(0, 5)
            .map((row) => ({ uri: row.url, name: row.name, description: "Open in Armin" })),
        ],
      };
    }
    if (tool === "get_card_details") {
      const args = parseAgentInput(agentToolSchemas.get_card_details, input);
      const card = await cardForAccess(ctx, connection, args.cardId);
      const details = await cardDetails(ctx, library, card._id);
      if (!details) fail("NOT_FOUND", "Card not found.");
      const { type, content } = parseFlashcard(card);
      const view = cardView(card, details.flashcard.deckName);
      const units = details.units.map((unit) => ({
        unitId: unit.reviewUnitId,
        subKey: unit.subKey,
        state: unit.state,
        stateName: unit.stateName,
        due: unit.due,
        stability: unit.stability,
        difficulty: unit.difficulty,
        reps: unit.reps,
        lapses: unit.lapses,
        lastReview: unit.lastReview,
        version: unit.version,
        locked: unit.locked,
        archived: unit.archived,
      }));
      const reviews = details.reviews.slice(0, CARD_DETAIL_REVIEWS).map((review) => ({
        reviewLogId: review.reviewLogId,
        reviewUnitId: review.reviewUnitId,
        rating: review.rating,
        review: review.review,
        state: review.state,
        stateName: review.stateName,
        intervalMs: review.intervalMs,
      }));
      const lines = [
        `Card ${view.id} v${view.version} · ${type} · "${view.deckName}"${view.archived ? " · archived" : ""}: ${view.preview}`,
        `Tags: ${view.tags.length ? view.tags.join(", ") : "none"}.`,
        units.length ? "Review units:" : "This card has no review units.",
        ...units.map(
          (unit) =>
            `- ${unit.unitId} · ${unit.stateName} · due in ${formatInterval(details.serverNow, unit.due)} · stability ${unit.stability.toFixed(1)} d · difficulty ${unit.difficulty.toFixed(2)} · ${unit.reps} reps · ${unit.lapses} lapses${unit.lastReview == null ? " · never reviewed" : ` · last reviewed ${new Date(unit.lastReview).toISOString()}`}${unit.locked ? " · locked" : ""}${unit.archived ? " · archived" : ""}`,
        ),
      ];
      if (reviews.length) {
        lines.push(`Recent reviews (latest ${reviews.length}):`);
        for (const review of reviews)
          lines.push(
            `- ${new Date(review.review).toISOString()} · rating ${review.rating} · ${review.stateName} · ${review.reviewUnitId}`,
          );
      } else {
        lines.push("No reviews yet.");
      }
      return {
        value: {
          card: { ...view, content },
          units,
          reviews,
          historyLimit: CARD_DETAIL_REVIEWS,
          serverNow: details.serverNow,
        },
        text: lines.join("\n"),
        links: [deckLink({ _id: card.deckId, name: view.deckName })],
      };
    }
    if (tool === "get_due_cards") {
      const args = parseAgentInput(agentToolSchemas.get_due_cards, input);
      const limit = args.limit ?? 5;
      let deck: Doc<"decks"> | null = null;
      if (args.deckId) {
        const id = ctx.db.normalizeId("decks", args.deckId);
        if (!id) fail("NOT_FOUND", "Deck not found.");
        deck = await requireDeck(ctx, connection, id);
      }
      const now = Date.now();
      const session = await selectSession(ctx, library, deck?._id ?? null, now);
      const dueCount = session.reviews.length + session.frontier.length;
      const selected = [...session.reviews, ...session.frontier].slice(0, limit);
      const hydrated = await toQueueItems(ctx, selected);
      const units = hydrated.map((item) => ({
        unitId: item.reviewUnitId,
        cardId: item.flashcardId,
        deckId: item.deckId,
        deckName: item.deckName,
        prompt: item.front,
        answer: item.back,
        type: item.type,
        stateToken: String(item.version),
        due: item.due,
        isNew: item.isNew,
        url: deckUrl(item.deckId),
      }));
      const scope = deck ? ` in "${deck.name}"` : "";
      const lines = [
        units.length
          ? `Next ${units.length} of ${dueCount} due cards${scope}:`
          : `No cards are due now${scope}.`,
        ...units.map(
          (unit) =>
            `- ${unit.unitId} · ${unit.type} · ${unit.isNew ? "new" : "review"} · stateToken ${unit.stateToken} · ${plainText(unit.prompt)}`,
        ),
      ];
      if (units.length)
        lines.push(
          "Show one prompt at a time. Reveal an answer only after the user answers, then call rate_card with their own rating and the unit's stateToken.",
        );
      const links = [];
      const linked = new Set<string>();
      for (const unit of units) {
        if (linked.has(unit.deckId)) continue;
        linked.add(unit.deckId);
        links.push({ uri: unit.url, name: unit.deckName, description: "Open in Armin" });
      }
      return {
        value: {
          serverNow: now,
          deck: deck ? { id: deck._id, name: deck.name, url: deckUrl(deck._id) } : null,
          units,
          dueCount,
          remaining: Math.max(0, dueCount - units.length),
        },
        text: lines.join("\n"),
        links,
      };
    }
    fail("INVALID", "Unknown read tool.");
  },
});

async function saveCards(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = parseAgentInput(agentToolSchemas.save_cards, input);
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
  const url = deckUrl(deck._id);
  const summary = `Created ${ids.size} ${ids.size === 1 ? "card" : "cards"} and ${added.length} ${added.length === 1 ? "prerequisite" : "prerequisites"}`;
  const idLines = [...ids].map(([key, id]) => `- ${key} -> ${id}`);
  const shown = idLines.slice(0, MAX_TEXT_LINES);
  if (idLines.length > shown.length)
    shown.push(`… and ${idLines.length - shown.length} more; read_deck lists every card ID.`);
  return {
    deckId: deck._id,
    summary,
    value: {
      deckId: deck._id,
      cards: [...ids].map(([key, id]) => ({ key, id })),
      prerequisiteCount: added.length,
      url,
      summary,
    },
    text: [`${summary} in "${deck.name}" (deck ${deck._id}).`, ...shown, `Study: ${url}`].join(
      "\n",
    ),
    links: [deckLink(deck)],
  };
}

async function editCard(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = parseAgentInput(agentToolSchemas.update_card, input);
  const card = await cardForEdit(ctx, connection, args.cardId, args.expectedVersion);
  if (card.type === "concept")
    fail("INVALID", "Concept cards can only be created and edited in Armin's card editor.");
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
  await editFlashcard(ctx, card, { input: parsed, tags: args.tags }, Date.now());
  const updated = (await ctx.db.get(card._id))!;
  const deck = (await ctx.db.get(updated.deckId))!;
  const view = cardView(updated, deck.name);
  const summary = "Updated a card";
  return {
    deckId: updated.deckId,
    summary,
    value: { ...view, summary },
    text: `Updated card ${view.id} (v${view.version}) in "${deck.name}": ${view.preview}`,
    links: [deckLink(deck)],
  };
}

async function archiveCard(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = parseAgentInput(agentToolSchemas.set_card_archived, input);
  const card = await cardForEdit(ctx, connection, args.cardId, args.expectedVersion);
  await setFlashcardArchived(ctx, card, args.archived, Date.now());
  const updated = (await ctx.db.get(card._id))!;
  const deck = (await ctx.db.get(updated.deckId))!;
  const view = cardView(updated, deck.name);
  const summary = args.archived ? "Archived a card" : "Unarchived a card";
  return {
    deckId: updated.deckId,
    summary,
    value: { ...view, summary },
    text: `${args.archived ? "Archived" : "Unarchived"} card ${view.id} (v${view.version}) in "${deck.name}": ${view.preview}${args.archived ? ". It is hidden from study; set archived false to restore it." : ""}`,
    links: [deckLink(deck)],
  };
}

async function editDeck(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = parseAgentInput(agentToolSchemas.update_deck, input);
  const id = ctx.db.normalizeId("decks", args.deckId);
  if (!id) fail("NOT_FOUND", "Deck not found.");
  const deck = await requireDeck(ctx, connection, id);
  if (deck.version !== args.expectedVersion)
    fail("CONFLICT", "This deck changed elsewhere. Read it again before editing.");
  const version = await updateDeckDetails(ctx, deck, args, Date.now());
  const updated = (await ctx.db.get(id))!;
  const library = await ctx.db.get(connection.libraryId);
  if (!library) fail("UNAUTHENTICATED", "This library is unavailable.");
  const counters = await ctx.db
    .query("deckCounters")
    .withIndex("by_deck", (q) => q.eq("deckId", id))
    .unique();
  const dueCount = (await dueCounts(ctx, library, Date.now())).perDeck[id] ?? 0;
  const summary = "Updated deck details";
  return {
    deckId: id,
    summary,
    value: {
      id,
      deckId: id,
      name: updated.name,
      description: updated.description,
      version,
      cardCount: counters?.active ?? 0,
      dueCount,
      url: deckUrl(id),
      summary,
    },
    text: `Updated deck "${updated.name}" (id ${id}, v${version}): ${plural(counters?.active ?? 0, "card", "cards")}, ${dueCount} due.`,
    links: [deckLink(updated)],
  };
}

async function setPrerequisite(
  ctx: MutationCtx,
  connection: Doc<"agentConnections">,
  input: unknown,
) {
  const args = parseAgentInput(agentToolSchemas.set_prerequisite, input);
  const deckId = ctx.db.normalizeId("decks", args.deckId);
  if (!deckId) fail("NOT_FOUND", "Deck not found.");
  const deck = await requireDeck(ctx, connection, deckId);
  if (graphRevision(deck) !== args.expectedRevision)
    fail("CONFLICT", "The deck's graph changed. Read it again before changing prerequisites.");
  const prereq = await cardForAccess(ctx, connection, args.prerequisiteId);
  const dependent = await cardForAccess(ctx, connection, args.dependentId);
  if (prereq.deckId !== deckId || dependent.deckId !== deckId)
    fail("INVALID", "Prerequisites must stay in the same authorized deck.");
  const now = Date.now();
  let changed = false;
  if (args.present) {
    changed =
      (
        await linkPrerequisites(
          ctx,
          deck,
          [{ prereqId: prereq._id, dependentId: dependent._id }],
          now,
        )
      ).length > 0;
  } else {
    const edge = await ctx.db
      .query("prereqs")
      .withIndex("by_pair", (q) => q.eq("prereqId", prereq._id).eq("dependentId", dependent._id))
      .unique();
    if (edge) {
      await unlinkPrerequisite(ctx, edge, now);
      changed = true;
    }
  }
  const revision = args.expectedRevision + (changed ? 1 : 0);
  const summary = args.present ? "Added a prerequisite" : "Removed a prerequisite";
  return {
    deckId,
    summary,
    value: { deckId, revision, url: deckUrl(deckId), summary },
    text: `${summary}: ${prereq._id} -> ${dependent._id} in deck "${deck.name}" (revision ${revision}).`,
    links: [deckLink(deck)],
  };
}

async function moveCard(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = parseAgentInput(agentToolSchemas.move_card, input);
  const card = await cardForEdit(ctx, connection, args.cardId, args.expectedVersion);
  const target = ctx.db.normalizeId("decks", args.targetDeckId);
  if (!target) fail("NOT_FOUND", "Deck not found.");
  const deck = await requireDeck(ctx, connection, target);
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
  await moveFlashcard(ctx, card, target, Date.now());
  const updated = (await ctx.db.get(card._id))!;
  const view = cardView(updated, deck.name);
  const summary = "Moved a card";
  return {
    deckId: target,
    summary,
    value: { ...view, summary },
    text: `Moved card ${view.id} (v${view.version}) to "${deck.name}": ${view.preview}`,
    links: [deckLink(deck)],
  };
}

async function rateCard(ctx: MutationCtx, connection: Doc<"agentConnections">, input: unknown) {
  const args = parseAgentInput(agentToolSchemas.rate_card, input);
  const unitId = ctx.db.normalizeId("reviewUnits", args.unitId);
  if (!unitId) fail("NOT_FOUND", "Review unit not found.");
  const expectedVersion = Number(args.expectedState);
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0)
    fail("INVALID", "stateToken is not valid. Call get_due_cards again.");
  const library = await ctx.db.get(connection.libraryId);
  if (!library || library.status !== "active")
    fail("UNAUTHENTICATED", "This library is unavailable.");
  const result = await rateReviewUnit(ctx, library, {
    reviewUnitId: unitId,
    rating: RATINGS[args.rating],
    expectedVersion,
  });
  if (result.status !== "ok") fail("CONFLICT", result.message);
  const unit = await ctx.db.get(result.reviewUnitId);
  if (!unit) fail("NOT_FOUND", "Review unit not found.");
  const now = Date.now();
  const summary = `Rated a card ${args.rating}`;
  const deck = await ctx.db.get(result.deckId);
  return {
    deckId: result.deckId,
    summary,
    value: {
      unitId: unit._id,
      cardId: unit.flashcardId,
      deckId: unit.deckId,
      rating: args.rating,
      version: unit.version,
      due: unit.due,
      url: deckUrl(unit.deckId),
      summary,
    },
    text: `Rated card ${unit.flashcardId} "${args.rating}"; next due in ${formatInterval(now, unit.due)}.`,
    ...(deck ? { links: [deckLink(deck)] } : {}),
  };
}

const operations = {
  save_cards: saveCards,
  update_card: editCard,
  set_card_archived: archiveCard,
  update_deck: editDeck,
  set_prerequisite: setPrerequisite,
  move_card: moveCard,
  rate_card: rateCard,
};

export const write = internalMutation({
  args: {
    user: agentUser,
    scope: v.string(),
    tool: v.string(),
    input: v.any(),
    fingerprint: v.string(),
  },
  handler: async (ctx, { user, scope, tool, input, fingerprint }) => {
    const key = tool as AgentToolName;
    const schema = agentToolSchemas[key];
    const required = agentToolScopes[key];
    if (!schema || !required) fail("INVALID", "Unknown tool.");
    if (scope !== required) fail("INVALID", "This tool's permission check does not match.");
    const { connection } = await agentAccess(ctx, user, required);
    const parsed = parseAgentInput(schema, input);
    if (!("requestId" in parsed)) fail("INVALID", "This is not a write tool.");
    const operation = operations[tool as keyof typeof operations];
    if (!operation) fail("INVALID", "Unknown write tool.");
    return runAgentWrite<AgentWriteToolResult>(
      ctx,
      connection,
      { requestId: parsed.requestId, fingerprint },
      {
        replay: async (saved) => {
          await requireDeck(ctx, connection, saved.deckId);
          return saved;
        },
        write: async () => {
          const result = await operation(ctx, connection, input);
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
