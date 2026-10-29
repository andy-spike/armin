/*
 * The review session engine: which occurrences of review units a study
 * session holds, which one is on screen, what Undo can reverse, and how a
 * fresh queue merges into a running session. It is pure (state in, state
 * out), so any client can drive it; saving answers to a server is the
 * caller's job, reported back through `saved` and `rejected` events.
 */

/** What the engine needs from a queued review unit; clients may carry more. */
export type ReviewSessionUnit = { id: string; flashcardId: string; version: number };

export type SessionCard<Unit extends ReviewSessionUnit> = Unit & {
  /** Stable identity for this occurrence, even when its unit version changes. */
  turnId: string;
  reviewed: boolean;
};

export type BuriedUnit = {
  reviewUnitId: string;
  /** Version the bury wrote, which Undo must still find unchanged. */
  version: number;
  previousBuriedUntil: number | null;
};

export type HistoryEntry =
  | { kind: "review"; turnId: string; reviewUnitId: string; reviewLogId: string; version: number }
  | { kind: "bury"; turnId: string; flashcardId: string; units: BuriedUnit[] };

export type SessionRateResult =
  | { status: "ok"; reviewLogId: string; version: number }
  | { status: "stale" | "ineligible"; message: string };

/** Undo result for either a rating or a bury. */
export type SessionUndoResult =
  | { status: "ok"; reviewUnitId: string; version: number }
  | { status: "ok"; flashcardId: string }
  | { status: "stale"; message: string };

export type ReviewSessionState<Unit extends ReviewSessionUnit> = {
  cards: SessionCard<Unit>[];
  /** Position of the card on screen; `cards.length` once the session is done. */
  index: number;
  /** Saved answers and buries, oldest first; Undo reverses the last. */
  history: HistoryEntry[];
  /** The card on screen changed elsewhere; the user decides what to do. */
  stale: { next: Unit | null; message: string } | null;
  notice: string | null;
};

export type ReviewSessionEvent<Unit extends ReviewSessionUnit> =
  /** A fresh queue arrived. `allowNewCards: false` freezes practice membership. */
  | { type: "queue"; incoming: Unit[]; allowNewCards: boolean }
  /** The card on screen was answered; `repeatAgainOffset` re-queues an Again. */
  | { type: "rated"; grade: 1 | 2 | 3 | 4; requestId: string; repeatAgainOffset?: number }
  | { type: "saved"; turnId: string; reviewUnitId: string; reviewLogId: string; version: number }
  | { type: "rejected"; reviewUnitId: string; message: string }
  /** A unit left the session (archived, deleted, or gone elsewhere). */
  | { type: "removed"; reviewUnitIds: string[]; notice?: string }
  | { type: "buried"; turnId: string; flashcardId: string; units: BuriedUnit[] }
  | { type: "buryRejected"; flashcardId: string; message: string }
  | { type: "undone"; entry: HistoryEntry; result: SessionUndoResult }
  | { type: "acceptStale" }
  | { type: "step"; delta: -1 | 1 }
  | { type: "notice"; message: string | null }
  | { type: "reset" };

export function initialReviewSession<Unit extends ReviewSessionUnit>(): ReviewSessionState<Unit> {
  return { cards: [], index: 0, history: [], stale: null, notice: null };
}

export function reduceReviewSession<Unit extends ReviewSessionUnit>(
  state: ReviewSessionState<Unit>,
  event: ReviewSessionEvent<Unit>,
): ReviewSessionState<Unit> {
  const next = apply(state, event);
  // Each new turn starts without the previous card's stale warning.
  const before = state.cards[state.index]?.turnId;
  const after = next.cards[next.index]?.turnId;
  return before !== after && next.stale ? { ...next, stale: null } : next;
}

function apply<Unit extends ReviewSessionUnit>(
  state: ReviewSessionState<Unit>,
  event: ReviewSessionEvent<Unit>,
): ReviewSessionState<Unit> {
  const active = state.cards[state.index];
  switch (event.type) {
    case "queue": {
      // The first response seeds the session even when membership is frozen.
      const merged = reconcileSessionCards(
        state.cards,
        event.incoming,
        active?.turnId,
        event.allowNewCards || state.cards.length === 0,
      );
      return {
        ...state,
        cards: merged.cards,
        stale: merged.staleActive
          ? { next: merged.staleActive, message: "This card was changed in another tab or device." }
          : state.stale,
      };
    }
    case "rated": {
      if (!active || active.reviewed) return state;
      let cards = state.cards.map((c) =>
        c.turnId === active.turnId ? { ...c, reviewed: true } : c,
      );
      if (event.grade === 1 && event.repeatAgainOffset !== undefined) {
        // Practice sessions give a forgotten card another turn a few cards
        // later. The copy is a new occurrence of the same unit, so its answer
        // is logged separately.
        const at = Math.min(state.index + 1 + event.repeatAgainOffset, cards.length);
        const repeat = {
          ...active,
          turnId: `${active.turnId}:again:${event.requestId}`,
          reviewed: false,
        };
        cards = [...cards.slice(0, at), repeat, ...cards.slice(at)];
      }
      return { ...state, cards, index: nextUnreviewedIndex(cards, state.index), notice: null };
    }
    case "saved":
      return {
        ...state,
        history: [
          ...state.history,
          {
            kind: "review",
            turnId: event.turnId,
            reviewUnitId: event.reviewUnitId,
            reviewLogId: event.reviewLogId,
            version: event.version,
          },
        ],
        cards: state.cards.map((c) =>
          c.turnId === event.turnId ? { ...c, version: event.version } : c,
        ),
      };
    case "rejected":
      // Rejected (changed or deleted elsewhere, or not eligible yet). A later
      // queue brings the card back if it is still due.
      return {
        ...removeUnits(state, [event.reviewUnitId]),
        notice: `${event.message} Your answer to that card wasn't saved.`,
      };
    case "removed": {
      const removed = removeUnits(state, event.reviewUnitIds);
      return event.notice ? { ...removed, notice: event.notice } : removed;
    }
    case "buried": {
      const entry: HistoryEntry = {
        kind: "bury",
        turnId: event.turnId,
        flashcardId: event.flashcardId,
        units: event.units,
      };
      return {
        ...removeWhere(state, (c) => c.flashcardId === event.flashcardId),
        history: [...state.history, entry],
        notice: "Card buried until tomorrow.",
      };
    }
    case "buryRejected":
      return {
        ...removeWhere(state, (c) => c.flashcardId === event.flashcardId),
        notice: event.message,
      };
    case "undone": {
      const { entry, result } = event;
      const history = state.history.slice(0, -1);
      if (result.status === "ok" && "reviewUnitId" in result && entry.kind === "review") {
        // Undo returns to the exact occurrence that was answered, removing any
        // waiting repeat of that unit so it cannot appear twice.
        const cards = state.cards
          .filter((c) => c.id !== entry.reviewUnitId || c.reviewed)
          .map((c) =>
            c.turnId === entry.turnId ? { ...c, version: result.version, reviewed: false } : c,
          );
        const index = cards.findIndex((c) => c.turnId === entry.turnId);
        return {
          ...state,
          cards,
          history,
          index: index >= 0 ? index : state.index,
          stale: null,
        };
      }
      // Unburied cards return through the live queue.
      const notice = result.status === "ok" ? "Card unburied." : result.message;
      return { ...state, history, notice };
    }
    case "acceptStale": {
      if (!active || !state.stale) return state;
      const update = state.stale.next;
      const accepted = update
        ? {
            ...state,
            cards: state.cards.map((c) => (c.turnId === active.turnId ? { ...c, ...update } : c)),
          }
        : removeUnits(state, [active.id]);
      return { ...accepted, stale: null };
    }
    case "step": {
      const index = state.index + event.delta;
      return index >= 0 && index < state.cards.length ? { ...state, index } : state;
    }
    case "notice":
      return { ...state, notice: event.message };
    case "reset":
      return initialReviewSession();
  }
}

/** Pending cards missing from a queue: deleted elsewhere, or held back by a budget. */
export function missingFromQueue<Unit extends ReviewSessionUnit>(
  cards: SessionCard<Unit>[],
  incoming: { id: string }[],
) {
  const ids = new Set(incoming.map((c) => c.id));
  return cards.filter((c) => !c.reviewed && !ids.has(c.id));
}

function sessionCard<Unit extends ReviewSessionUnit>(unit: Unit): SessionCard<Unit> {
  return { ...unit, turnId: `${unit.id}:${unit.version}`, reviewed: false };
}

function nextUnreviewedIndex(cards: { reviewed: boolean }[], reviewedIndex: number) {
  for (let i = reviewedIndex + 1; i < cards.length; i++) {
    if (!cards[i]!.reviewed) return i;
  }
  // Skipped cards are revisited at the end of the session, so completion can
  // never hide a due card behind "All caught up".
  for (let i = 0; i < reviewedIndex; i++) {
    if (!cards[i]!.reviewed) return i;
  }
  return cards.length;
}

/**
 * Merge a fresh queue into the running session. Cards not yet on screen take
 * the latest data, new due cards are appended, and the card being answered
 * keeps the prompt the user is looking at: if it changed elsewhere it is
 * reported as stale instead of being swapped under them.
 */
function reconcileSessionCards<Unit extends ReviewSessionUnit>(
  current: SessionCard<Unit>[],
  incoming: Unit[],
  activeTurnId: string | undefined,
  allowNewCards: boolean,
) {
  const incomingById = new Map(incoming.map((c) => [c.id, c]));
  const pendingIds = new Set(current.filter((c) => !c.reviewed).map((c) => c.id));
  const reviewedVersions = new Map<string, number>();
  for (const c of current) {
    if (c.reviewed) {
      reviewedVersions.set(c.id, Math.max(reviewedVersions.get(c.id) ?? 0, c.version));
    }
  }
  let staleActive: Unit | null = null;
  const updated = current.map((c) => {
    if (c.reviewed) return c;
    const next = incomingById.get(c.id);
    if (!next || next.version < c.version) return c;
    if (c.turnId === activeTurnId && next.version !== c.version) {
      staleActive = next;
      return c;
    }
    return { ...c, ...next };
  });
  // A completed occurrence stays in history. A newly due occurrence belongs
  // ahead of the cursor, but an old queue response must not resurrect it.
  const appended = allowNewCards
    ? incoming
        .filter((c) => !pendingIds.has(c.id) && c.version >= (reviewedVersions.get(c.id) ?? 0))
        .map(sessionCard)
    : [];
  return { cards: [...updated, ...appended], staleActive: staleActive as Unit | null };
}

/** Drop units from the session; Undo can't restore a unit that is gone. */
function removeUnits<Unit extends ReviewSessionUnit>(
  state: ReviewSessionState<Unit>,
  reviewUnitIds: string[],
) {
  const ids = new Set(reviewUnitIds);
  const removed = removeWhere(state, (c) => ids.has(c.id));
  return {
    ...removed,
    history: removed.history.filter(
      (entry) => entry.kind !== "review" || !ids.has(entry.reviewUnitId),
    ),
  };
}

function removeWhere<Unit extends ReviewSessionUnit>(
  state: ReviewSessionState<Unit>,
  matches: (card: SessionCard<Unit>) => boolean,
): ReviewSessionState<Unit> {
  const cards = state.cards.filter((c) => !matches(c));
  const shifted = state.index - state.cards.slice(0, state.index).filter(matches).length;
  let index = Math.min(shifted, cards.length);
  if (index >= cards.length) {
    // Removing the last card does not complete the session while an earlier
    // skipped card is still waiting.
    const firstPending = cards.findIndex((c) => !c.reviewed);
    index = firstPending >= 0 ? firstPending : cards.length;
  }
  return { ...state, cards, index };
}
