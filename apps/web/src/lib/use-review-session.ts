import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  initialReviewSession,
  missingFromQueue,
  reduceReviewSession,
  type BuriedUnit,
  type HistoryEntry,
  type ReviewSessionEvent,
  type SessionCard,
  type SessionRateResult,
  type SessionUndoResult,
} from "@armin/core/review-session";
import type { Grade, UiReviewUnit } from "@/types/view-models";

/** An answer shown as done on screen while the server saves it. */
type Submission = {
  turnId: string;
  card: SessionCard<UiReviewUnit>;
  rating: Grade;
  requestId: string;
};

type BuryOutcome = { status: "ok"; units: BuriedUnit[] } | { status: "stale"; message: string };

const RETRY_DELAYS_MS = [500, 1_000, 2_000, 5_000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Drives the `@armin/core/review-session` engine against the server. Answers
 * show as done at once and save in the background, one at a time in answer
 * order; a request whose outcome is unknown is retried with the same request
 * id, so the server applies each answer at most once.
 */
export function useReviewSession({
  queue,
  ready,
  allowNewCards,
  repeatAgainOffset,
  resetKey,
  online,
  loadPreview,
  onRate,
  onUndo,
  onBury,
}: {
  queue: UiReviewUnit[];
  /** False while the queue is loading or failed; the session shows no cards. */
  ready: boolean;
  allowNewCards: boolean;
  repeatAgainOffset?: number;
  resetKey?: string;
  online: boolean;
  loadPreview: (reviewUnitId: string) => Promise<unknown>;
  onRate: (card: UiReviewUnit, rating: Grade, requestId: string) => Promise<SessionRateResult>;
  onUndo?: (entry: HistoryEntry, requestId: string) => Promise<SessionUndoResult>;
  onBury?: (flashcardId: string, requestId: string) => Promise<BuryOutcome>;
}) {
  const [state, setState] = useState(initialReviewSession<UiReviewUnit>);
  // Async work reads and updates the latest state through this ref.
  const stateRef = useRef(state);
  const dispatch = useCallback((event: ReviewSessionEvent<UiReviewUnit>) => {
    stateRef.current = reduceReviewSession(stateRef.current, event);
    setState(stateRef.current);
  }, []);

  const submissionsRef = useRef<Submission[]>([]);
  const [saving, setSaving] = useState(0);
  const [saveFailing, setSaveFailing] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [burying, setBurying] = useState(false);
  const drainWaitersRef = useRef<(() => void)[]>([]);
  const savingLoopRef = useRef(false);
  // Missing queue entries may have been deleted elsewhere; preview returns
  // null once the unit is gone. Each is checked once while it stays missing.
  const missingCheckedRef = useRef(new Set<string>());
  const onRateRef = useRef(onRate);
  const loadPreviewRef = useRef(loadPreview);
  useLayoutEffect(() => {
    stateRef.current = state;
    onRateRef.current = onRate;
    loadPreviewRef.current = loadPreview;
  });

  const cards = ready ? state.cards : [];
  const card = cards[state.index];

  /** Resolve once every answer given so far has a server outcome. */
  const whenSaved = () =>
    submissionsRef.current.length === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => drainWaitersRef.current.push(resolve));

  const saveAnswers = async () => {
    if (savingLoopRef.current) return;
    savingLoopRef.current = true;
    try {
      let attempt = 0;
      while (submissionsRef.current.length > 0) {
        const submission = submissionsRef.current[0]!;
        let result: SessionRateResult;
        try {
          result = await onRateRef.current(
            submission.card,
            submission.rating,
            submission.requestId,
          );
        } catch {
          setSaveFailing(true);
          await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]!);
          attempt += 1;
          continue;
        }
        attempt = 0;
        setSaveFailing(false);
        submissionsRef.current.shift();
        dispatch(
          result.status === "ok"
            ? {
                type: "saved",
                turnId: submission.turnId,
                reviewUnitId: submission.card.id,
                reviewLogId: result.reviewLogId,
                version: result.version,
              }
            : { type: "rejected", reviewUnitId: submission.card.id, message: result.message },
        );
        setSaving(submissionsRef.current.length);
      }
    } finally {
      savingLoopRef.current = false;
      const waiters = drainWaitersRef.current;
      drainWaitersRef.current = [];
      for (const resolve of waiters) resolve();
    }
  };

  /** Answer the card on screen; the next card shows while the answer saves. False when ignored. */
  const rate = (grade: Grade) => {
    if (!card || card.reviewed || undoing || state.stale || !online) return false;
    if (submissionsRef.current.some((s) => s.turnId === card.turnId)) return false;
    const requestId = crypto.randomUUID();
    submissionsRef.current.push({ turnId: card.turnId, card, rating: grade, requestId });
    setSaving(submissionsRef.current.length);
    dispatch({ type: "rated", grade, requestId, repeatAgainOffset });
    void saveAnswers();
    return true;
  };

  /** Undo the latest answer or bury. Resolves true when an answer came back on screen. */
  const undoLast = async () => {
    if (!onUndo || undoing || !online) return false;
    if (stateRef.current.history.length === 0 && submissionsRef.current.length === 0) return false;
    setUndoing(true);
    dispatch({ type: "notice", message: null });
    try {
      // The latest answer may still be saving.
      await whenSaved();
      const last = stateRef.current.history.at(-1);
      if (!last) return false;
      const requestId =
        last.kind === "review" ? `undo:${last.reviewLogId}` : `undo:bury:${last.turnId}`;
      const result = await onUndo(last, requestId);
      dispatch({ type: "undone", entry: last, result });
      return result.status === "ok" && last.kind === "review";
    } catch {
      dispatch({ type: "notice", message: "Couldn't undo. Check your connection and try again." });
      return false;
    } finally {
      setUndoing(false);
    }
  };

  /** Hide every unit of the card on screen until tomorrow. */
  const bury = async () => {
    if (!card || !onBury || burying || !online) return;
    setBurying(true);
    dispatch({ type: "notice", message: null });
    try {
      // Let answers already given (including siblings of this flashcard) land
      // before the whole card's versions change.
      await whenSaved();
      const result = await onBury(card.flashcardId, crypto.randomUUID());
      dispatch(
        result.status === "ok"
          ? {
              type: "buried",
              turnId: card.turnId,
              flashcardId: card.flashcardId,
              units: result.units,
            }
          : { type: "buryRejected", flashcardId: card.flashcardId, message: result.message },
      );
    } catch {
      dispatch({
        type: "notice",
        message: "Couldn't bury this card. Check your connection and try again.",
      });
    } finally {
      setBurying(false);
    }
  };

  // Closing the tab while answers are still saving would lose them.
  useEffect(() => {
    if (saving === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saving]);

  // A new session key starts over.
  const [sessionKey, setSessionKey] = useState(resetKey);
  if (resetKey !== sessionKey) {
    setSessionKey(resetKey);
    setState(initialReviewSession());
  }
  useLayoutEffect(() => {
    missingCheckedRef.current.clear();
  }, [resetKey]);

  useEffect(() => {
    // While answers are saving, a refreshed queue can still list a card that
    // was just answered; merge once the server has every answer.
    if (!ready || saving > 0 || undoing) return;
    dispatch({ type: "queue", incoming: queue, allowNewCards });
    // A card that reappears may go missing again later (e.g. it is deleted
    // after being answered elsewhere), so forget earlier checks on presence.
    const incomingIds = new Set(queue.map((c) => c.id));
    for (const id of missingCheckedRef.current) {
      if (incomingIds.has(id)) missingCheckedRef.current.delete(id);
    }
    const unchecked = missingFromQueue(stateRef.current.cards, queue).filter(
      (c) => !missingCheckedRef.current.has(c.id),
    );
    if (unchecked.length === 0) return;
    void Promise.all(
      unchecked.map(async (missing) => {
        try {
          const preview = await loadPreviewRef.current(missing.id);
          missingCheckedRef.current.add(missing.id);
          return { id: missing.id, deleted: preview === null };
        } catch {
          // A transient failure is not evidence of deletion; retry on the
          // next queue update.
          return { id: missing.id, deleted: false };
        }
      }),
    ).then((checked) => {
      const deleted = checked.filter((c) => c.deleted).map((c) => c.id);
      if (deleted.length === 0) return;
      dispatch({
        type: "removed",
        reviewUnitIds: deleted,
        notice: "This card was deleted in another tab. It was removed from the session.",
      });
    });
  }, [ready, queue, saving, undoing, allowNewCards, dispatch]);

  return {
    cards,
    card,
    index: state.index,
    history: state.history,
    stale: state.stale,
    notice: state.notice,
    saving,
    saveFailing,
    undoing,
    burying,
    rate,
    undoLast,
    bury,
    acceptStale: () => dispatch({ type: "acceptStale" }),
    step: (delta: -1 | 1) => {
      if (!undoing) dispatch({ type: "step", delta });
    },
    /** Drop a unit that was archived or deleted from the session. */
    remove: (reviewUnitId: string) => dispatch({ type: "removed", reviewUnitIds: [reviewUnitId] }),
  };
}
