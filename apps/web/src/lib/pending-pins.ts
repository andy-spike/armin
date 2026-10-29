import { useEffect, useSyncExternalStore } from "react";
import type { UiDeck } from "@/types/view-models";

/*
 * Pins the user has asked for that the live deck list doesn't show yet. The
 * list recomputes every deck's due count before it updates, which can take
 * seconds on a large library, and a result computed before the pin can still
 * arrive after it. Holding the requested state here until the list agrees
 * keeps the sidebar and menus from lagging or flipping back.
 */
/** `saved` once the mutation has finished; only then may the live list replace it. */
type Pending = { pinned: boolean; at: number; saved: boolean };

let pending = new Map<string, Pending>();
const listeners = new Set<() => void>();

function emit(next: Map<string, Pending>) {
  pending = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function requestPin(deckId: string, pinned: boolean) {
  emit(new Map(pending).set(deckId, { pinned, at: Date.now(), saved: false }));
}

/**
 * Convex resolves a mutation only after subscribed queries reflect it, so from
 * here on the live list is current and may take over.
 */
export function pinSaved(deckId: string, pinned: boolean) {
  const request = pending.get(deckId);
  // A newer toggle replaced this request; leave that one waiting.
  if (!request || request.pinned !== pinned) return;
  emit(new Map(pending).set(deckId, { ...request, saved: true }));
}

export function forgetPin(deckId: string) {
  if (!pending.has(deckId)) return;
  const next = new Map(pending);
  next.delete(deckId);
  emit(next);
}

/**
 * Each deck's pin time as the user expects to see it: the requested state while
 * a pin is in flight, the server's once the live list catches up.
 */
export function usePinnedAt(decks: UiDeck[] | undefined) {
  const current = useSyncExternalStore(
    subscribe,
    () => pending,
    () => pending,
  );

  useEffect(() => {
    if (!decks) return;
    for (const [deckId, request] of current) {
      const deck = decks.find((item) => item.id === deckId);
      if (!deck || (request.saved && (deck.pinnedAt != null) === request.pinned)) forgetPin(deckId);
    }
  }, [decks, current]);

  return (deck: UiDeck) => {
    const request = current.get(deck.id);
    if (!request) return deck.pinnedAt;
    return request.pinned ? (deck.pinnedAt ?? request.at) : null;
  };
}

/**
 * One deck's shown pin time, re-rendering only when that deck's request
 * changes, so a grid of decks doesn't redraw on every pin.
 */
export function useDeckPinnedAt(deck: UiDeck) {
  const request = useSyncExternalStore(
    subscribe,
    () => pending.get(deck.id),
    () => pending.get(deck.id),
  );
  const serverPinned = deck.pinnedAt != null;

  useEffect(() => {
    if (request?.saved && serverPinned === request.pinned) forgetPin(deck.id);
  }, [deck.id, request, serverPinned]);

  if (!request) return deck.pinnedAt;
  return request.pinned ? (deck.pinnedAt ?? request.at) : null;
}
