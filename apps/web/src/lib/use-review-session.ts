import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useMutationState } from "@tanstack/react-query";
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

type Submission = {
  turnId: string;
  card: SessionCard<UiReviewUnit>;
  rating: Grade;
  requestId: string;
};

type BuryOutcome = { status: "ok"; units: BuriedUnit[] } | { status: "stale"; message: string };

type Operation = "idle" | "undoing" | "burying";

const RETRY_DELAYS_MS = [500, 1_000, 2_000, 5_000];

const SAVE_ANSWER = ["review", "save-answer"];

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
  const stateRef = useRef(state);
  const dispatch = useCallback((event: ReviewSessionEvent<UiReviewUnit>) => {
    stateRef.current = reduceReviewSession(stateRef.current, event);
    setState(stateRef.current);
  }, []);

  const unsavedRef = useRef(new Set<string>());
  const [saving, setSaving] = useState(0);
  const drainWaitersRef = useRef<(() => void)[]>([]);
  const operationRef = useRef<Operation>("idle");
  const [operation, setOperation] = useState<Operation>("idle");
  const beginOperation = (next: Exclude<Operation, "idle">) => {
    if (operationRef.current !== "idle") return false;
    operationRef.current = next;
    setOperation(next);
    return true;
  };
  const endOperation = () => {
    operationRef.current = "idle";
    setOperation("idle");
  };
  const missingCheckedRef = useRef(new Set<string>());
  const removingRef = useRef(new Set<string>());
  const onRateRef = useRef(onRate);
  const loadPreviewRef = useRef(loadPreview);
  useLayoutEffect(() => {
    stateRef.current = state;
    onRateRef.current = onRate;
    loadPreviewRef.current = loadPreview;
  });

  const cards = ready ? state.cards : [];
  const card = cards[state.index];

  const saveAnswer = useMutation({
    mutationKey: SAVE_ANSWER,
    scope: { id: SAVE_ANSWER.join(":") },
    networkMode: "always",
    retry: true,
    retryDelay: (failures) => RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1]!,
    mutationFn: (submission: Submission) =>
      onRateRef.current(submission.card, submission.rating, submission.requestId),
    onSuccess: (result, submission) =>
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
      ),
    onSettled: (_result, _error, submission) => {
      unsavedRef.current.delete(submission.turnId);
      setSaving(unsavedRef.current.size);
      if (unsavedRef.current.size > 0) return;
      const waiters = drainWaitersRef.current;
      drainWaitersRef.current = [];
      for (const resolve of waiters) resolve();
    },
  });
  const saveFailing = useMutationState({
    filters: { mutationKey: SAVE_ANSWER, status: "pending" },
    select: (mutation) => mutation.state.failureCount > 0,
  }).some(Boolean);

  const whenSaved = () =>
    unsavedRef.current.size === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => drainWaitersRef.current.push(resolve));

  const rate = (grade: Grade) => {
    if (!card || card.reviewed || operationRef.current !== "idle" || state.stale || !online)
      return false;
    if (unsavedRef.current.has(card.turnId)) return false;
    const requestId = crypto.randomUUID();
    unsavedRef.current.add(card.turnId);
    setSaving(unsavedRef.current.size);
    dispatch({ type: "rated", grade, requestId, repeatAgainOffset });
    saveAnswer.mutate({ turnId: card.turnId, card, rating: grade, requestId });
    return true;
  };

  const undoLast = async () => {
    if (!onUndo || !online) return false;
    if (stateRef.current.history.length === 0 && unsavedRef.current.size === 0) return false;
    if (!beginOperation("undoing")) return false;
    dispatch({ type: "notice", message: null });
    try {
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
      endOperation();
    }
  };

  const bury = async () => {
    if (!card || !onBury || !online) return;
    if (!beginOperation("burying")) return;
    dispatch({ type: "notice", message: null });
    try {
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
      endOperation();
    }
  };

  useEffect(() => {
    if (saving === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saving]);

  const [sessionKey, setSessionKey] = useState(resetKey);
  if (resetKey !== sessionKey) {
    setSessionKey(resetKey);
    setState(initialReviewSession());
  }
  useLayoutEffect(() => {
    missingCheckedRef.current.clear();
  }, [resetKey]);

  useEffect(() => {
    if (!ready || saving > 0 || operation !== "idle") return;
    dispatch({ type: "queue", incoming: queue, allowNewCards });
    const incomingIds = new Set(queue.map((c) => c.id));
    for (const id of missingCheckedRef.current) {
      if (incomingIds.has(id)) missingCheckedRef.current.delete(id);
    }
    const unchecked = missingFromQueue(stateRef.current.cards, queue).filter(
      (c) => !missingCheckedRef.current.has(c.id) && !removingRef.current.has(c.id),
    );
    if (unchecked.length === 0) return;
    void Promise.all(
      unchecked.map(async (missing) => {
        try {
          const preview = await loadPreviewRef.current(missing.id);
          missingCheckedRef.current.add(missing.id);
          return { id: missing.id, deleted: preview === null };
        } catch {
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
  }, [ready, queue, saving, operation, allowNewCards, dispatch]);

  return {
    cards,
    card,
    index: state.index,
    history: state.history,
    stale: state.stale,
    notice: state.notice,
    saving,
    saveFailing,
    undoing: operation === "undoing",
    burying: operation === "burying",
    rate,
    undoLast,
    bury,
    acceptStale: () => dispatch({ type: "acceptStale" }),
    replace: (turnId: string, version: number) => dispatch({ type: "replaced", turnId, version }),
    step: (delta: -1 | 1) => {
      if (operationRef.current === "idle") dispatch({ type: "step", delta });
    },
    remove: (reviewUnitId: string) => dispatch({ type: "removed", reviewUnitIds: [reviewUnitId] }),
    removeFlashcard: async (flashcardId: string, change: () => Promise<unknown>) => {
      const ids = stateRef.current.cards
        .filter((c) => c.flashcardId === flashcardId)
        .map((c) => c.id);
      for (const id of ids) removingRef.current.add(id);
      try {
        await change();
        dispatch({ type: "removed", reviewUnitIds: ids });
      } finally {
        for (const id of ids) removingRef.current.delete(id);
      }
    },
  };
}
