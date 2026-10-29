import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { UiDeck } from "@/types/view-models";

/*
 * Deck renames, deletions, and creations the live deck list doesn't show yet.
 * Any deck change waits for every open study query to recompute before Convex
 * delivers it, a couple of seconds on a large library, so the sidebar and
 * Decks page show the edit from here until the list agrees. Pins have their
 * own store (pending-pins.ts) so pinning doesn't redraw the deck grid.
 */
type Pending =
  | { kind: "rename"; deckId: string; name: string; saved: boolean }
  | { kind: "delete"; deckId: string; saved: boolean }
  /** Under a temporary id until the server returns the real one. */
  | { kind: "create"; deckId: string; deck: ShownDeck; saved: false };

/** A deck row as shown: `pending` marks a placeholder for a deck still being created. */
export type ShownDeck = UiDeck & { pending?: boolean };

/** Allowed difference between this device's clock and the server's for a new deck's `createdAt`. */
const ARRIVAL_SKEW_MS = 5 * 60_000;

let pending: Pending[] = [];
const listeners = new Set<() => void>();

function emit(next: Pending[]) {
  pending = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function replace(edit: Pending) {
  emit([
    ...pending.filter((item) => !(item.kind === edit.kind && item.deckId === edit.deckId)),
    edit,
  ]);
}

export function requestRename(deckId: string, name: string) {
  replace({ kind: "rename", deckId, name, saved: false });
}

export function requestDelete(deckId: string) {
  replace({ kind: "delete", deckId, saved: false });
}

/**
 * Shows a placeholder for a deck being created. The create mutation resolves
 * only once the live list includes the deck, so the caller forgets it then.
 */
export function requestCreate(name: string, description: string | null) {
  const deckId = `pending:${crypto.randomUUID()}`;
  const now = Date.now();
  replace({
    kind: "create",
    deckId,
    saved: false,
    deck: {
      id: deckId as UiDeck["id"],
      name,
      slug: deckId,
      description,
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
      pending: true,
    },
  });
  return deckId;
}

/**
 * Convex resolves a mutation only after subscribed queries reflect it, so once
 * an edit has saved the live list may replace it as soon as it agrees.
 */
export function editSaved(kind: "rename" | "delete", deckId: string) {
  emit(
    pending.map((item) =>
      item.kind === kind && item.deckId === deckId ? { ...item, saved: true } : item,
    ),
  );
}

export function forgetEdit(kind: Pending["kind"], deckId: string) {
  emit(pending.filter((item) => !(item.kind === kind && item.deckId === deckId)));
}

function agrees(edit: Pending, deck: UiDeck | undefined) {
  if (edit.kind === "rename") return !deck || deck.name === edit.name;
  if (edit.kind === "delete") return !deck;
  // A placeholder has no real id to match; its creator removes it.
  return false;
}

/** The deck list as the user expects to see it, with pending edits applied. */
export function useShownDecks(decks: UiDeck[] | undefined): ShownDeck[] | undefined {
  const current = useSyncExternalStore(
    subscribe,
    () => pending,
    () => pending,
  );

  useEffect(() => {
    if (!decks) return;
    for (const edit of current) {
      const deck = decks.find((item) => item.id === edit.deckId);
      if (edit.saved && agrees(edit, deck)) forgetEdit(edit.kind, edit.deckId);
    }
  }, [decks, current]);

  return useMemo(() => {
    if (!decks || current.length === 0) return decks;
    const deleted = new Set(current.filter((edit) => edit.kind === "delete").map((e) => e.deckId));
    const names = new Map(
      current.flatMap((edit) =>
        edit.kind === "rename" ? [[edit.deckId, edit.name] as const] : [],
      ),
    );
    const shown: ShownDeck[] = decks
      .filter((deck) => !deleted.has(deck.id))
      // A rename can change the slug; link by id, which always resolves, until it lands.
      .map((deck) => {
        const name = names.get(deck.id);
        return name === undefined || name === deck.name ? deck : { ...deck, name, slug: deck.id };
      });
    for (const edit of current) {
      if (edit.kind !== "create") continue;
      // The live list can show the new deck a moment before the mutation
      // settles and removes its placeholder; don't show both.
      const arrived = decks.some(
        (deck) =>
          deck.name === edit.deck.name && deck.createdAt >= edit.deck.createdAt - ARRIVAL_SKEW_MS,
      );
      if (!arrived) shown.push(edit.deck);
    }
    return shown;
  }, [decks, current]);
}
