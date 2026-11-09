import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@armin/backend/api";
import type { DeckWithStats, Id } from "@armin/backend/types";

const PENDING_DECK_PREFIX = "pending:";

export function isPendingDeck(deck: { id: string }) {
  return deck.id.startsWith(PENDING_DECK_PREFIX);
}

type DeckRow = DeckWithStats;
type DeckRowEdit = (decks: DeckRow[]) => DeckRow[];

function editDeckRows(store: OptimisticLocalStore, edit: DeckRowEdit) {
  for (const { args, value } of store.getAllQueries(api.decks.list)) {
    if (value) store.setQuery(api.decks.list, args, edit(value));
  }
  for (const { args, value } of store.getAllQueries(api.decks.navigation)) {
    if (value) store.setQuery(api.decks.navigation, args, edit(value));
  }
}

function editDeckNames(
  store: OptimisticLocalStore,
  edit: (decks: { id: Id<"decks">; name: string }[]) => { id: Id<"decks">; name: string }[],
) {
  for (const { args, value } of store.getAllQueries(api.decks.listNames)) {
    if (value) store.setQuery(api.decks.listNames, args, edit(value));
  }
}

export function createDeckOptimistically(
  store: OptimisticLocalStore,
  args: { name: string; description?: string | null; requestId: string },
) {
  const now = Date.now();
  const id = `${PENDING_DECK_PREFIX}${args.requestId}` as Id<"decks">;
  const placeholder: DeckRow = {
    id,
    name: args.name,
    slug: id,
    description: args.description ?? null,
    version: 1,
    pinnedAt: null,
    createdAt: now,
    updatedAt: now,
    total: 0,
    archived: 0,
    due: 0,
    newCount: 0,
    learning: 0,
    learned: 0,
  };
  editDeckRows(store, (decks) => [...decks, placeholder]);
}

export function renameDeckOptimistically(
  store: OptimisticLocalStore,
  args: { deckId: Id<"decks">; name?: string },
) {
  const { deckId, name } = args;
  if (name === undefined) return;
  const rename = <Deck extends { id: string; name: string }>(decks: Deck[]) =>
    decks.map((deck) => (deck.id === deckId ? { ...deck, name } : deck));
  editDeckRows(store, rename);
  editDeckNames(store, rename);
  for (const { args: queryArgs, value } of store.getAllQueries(api.decks.get)) {
    if (value?.id === deckId) store.setQuery(api.decks.get, queryArgs, { ...value, name });
  }
}

export function deleteDeckOptimistically(
  store: OptimisticLocalStore,
  args: { deckId: Id<"decks"> },
) {
  const keep = <Deck extends { id: string }>(decks: Deck[]) =>
    decks.filter((deck) => deck.id !== args.deckId);
  editDeckRows(store, keep);
  editDeckNames(store, keep);
}

export function pinDeckOptimistically(
  store: OptimisticLocalStore,
  args: { deckId: Id<"decks">; pinned: boolean },
) {
  const pinnedAt = Date.now();
  editDeckRows(store, (decks) =>
    decks.map((deck) =>
      deck.id !== args.deckId || (deck.pinnedAt != null) === args.pinned
        ? deck
        : { ...deck, pinnedAt: args.pinned ? pinnedAt : null },
    ),
  );
}

export function updateSettingsOptimistically(
  store: OptimisticLocalStore,
  args: { keybindings?: string | null; autoplayAudio?: boolean },
) {
  const settings = store.getQuery(api.settings.get, {});
  if (!settings) return;
  const next = { ...settings };
  if (args.keybindings !== undefined) next.keybindings = args.keybindings;
  if (args.autoplayAudio !== undefined) next.autoplayAudio = args.autoplayAudio;
  store.setQuery(api.settings.get, {}, next);
}
