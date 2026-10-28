import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  AlertTriangle,
  Check,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Undo2,
  EllipsisVertical,
  Pencil,
  Archive,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Progress } from "@/components/ui/progress";
import { ReviewCardSkeleton, ReviewMetaSkeleton } from "@/components/page-skeletons";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImageOcclusionReview } from "@/components/image-occlusion-review";
import { FlashcardFormDialog } from "@/components/flashcard-form-dialog-lazy";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import { useScope } from "@/keybindings/keybindings-provider";
import type { FlashcardDeleteConsequences, Grade, PreviewOption } from "@/types/window";
import type { UiFlashcard, UiReviewUnit } from "@/types/view-models";
import { matchesTypeAnswer, renderClozeText } from "@armin/core/flashcard-rules";
import type {
  ClozeContent,
  ImageOcclusionContent,
  TypeAnswerContent,
} from "@armin/core/flashcard-types";
import { cn } from "@/lib/utils";

/*
 * Rating colours. Every label, interval, and shortcut chip inside these
 * buttons must clear WCAG AA (4.5:1) in both themes. Light "Good" and dark
 * "Again" are local per-theme shades; the dark hover shades are lighter than
 * the resting colours because a darker hover would drop black text below AA.
 * Global theme tokens are shared and owned elsewhere.
 */
const RATINGS: {
  grade: Grade;
  label: string;
  bg: string;
}[] = [
  {
    grade: 1,
    label: "Again",
    bg: "bg-again hover:bg-again-deep [[data-theme=dark]_&]:bg-[#d35347] [[data-theme=dark]_&]:hover:bg-[#e0655a]",
  },
  {
    grade: 2,
    label: "Hard",
    bg: "bg-hard hover:bg-hard-deep [[data-theme=dark]_&]:hover:bg-[#e58a4f]",
  },
  {
    grade: 3,
    label: "Good",
    bg: "bg-good hover:bg-good-deep [[data-theme=light]_&]:bg-[#637b0a] [[data-theme=light]_&]:hover:bg-[#5f770a] [[data-theme=dark]_&]:hover:bg-[#9aac4a]",
  },
  {
    grade: 4,
    label: "Easy",
    bg: "bg-easy hover:bg-easy-deep [[data-theme=dark]_&]:hover:bg-[#639fd0]",
  },
];

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatReviewHistory(consequences: FlashcardDeleteConsequences | null) {
  if (!consequences) return "Loading review history…";
  if (consequences.reviewLogCount === 0) {
    return `No review history will be destroyed across ${plural(consequences.reviewUnitCount, "review unit")}.`;
  }

  const first = consequences.firstReviewAt?.toLocaleDateString();
  const last = consequences.lastReviewAt?.toLocaleDateString();
  const span = first && last ? ` from ${first} to ${last}` : "";
  return `${plural(consequences.reviewLogCount, "review log")} across ${plural(consequences.reviewUnitCount, "review unit")} will be destroyed${span}.`;
}

type SessionReviewUnit = UiReviewUnit & {
  /** Stable identity for this occurrence, even when its unit version changes. */
  turnId: string;
  reviewed: boolean;
};

function sessionReviewUnit(unit: UiReviewUnit) {
  return { ...unit, turnId: `${unit.id}:${unit.version}`, reviewed: false };
}

function nextUnreviewedIndex(cards: SessionReviewUnit[], reviewedIndex: number) {
  for (let i = reviewedIndex + 1; i < cards.length; i++) {
    if (!cards[i].reviewed) return i;
  }
  // Skipped cards are revisited at the end of the session, so completion can
  // never hide a due card behind "All caught up".
  for (let i = 0; i < reviewedIndex; i++) {
    if (!cards[i].reviewed) return i;
  }
  return cards.length;
}

/**
 * Merge a fresh queue into the running session. Cards not yet on screen take
 * the latest data, new due cards are appended, and the card being answered
 * keeps the prompt the user is looking at: if it changed elsewhere it is
 * flagged stale instead of being swapped under them. Pending cards missing
 * from the queue are reported so the caller can check whether they still exist
 * (the queue also drops cards temporarily when the new-unit budget is spent).
 */
function reconcileSessionCards(
  current: SessionReviewUnit[],
  incoming: UiReviewUnit[],
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
  let staleActive: UiReviewUnit | null = null;
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
        .map(sessionReviewUnit)
    : [];
  const missing = current.filter((c) => !c.reviewed && !incomingById.has(c.id));
  return { cards: [...updated, ...appended], staleActive, missing };
}

type HistoryEntry = {
  turnId: string;
  reviewUnitId: string;
  reviewLogId: string;
  version: number;
};

/** An answer shown as done on screen while the server saves it. */
type Submission = { turnId: string; card: SessionReviewUnit; rating: Grade; requestId: string };

const RETRY_DELAYS_MS = [500, 1_000, 2_000, 5_000];

/** A unit's rating intervals change only when its schedule (version) does. */
const previewKey = (reviewUnitId: string, version: number) =>
  ["review-preview", reviewUnitId, version] as const;

/**
 * The prompt and revealed answer, shared by review and cram sessions so a
 * practice session renders cards exactly like the real reviewer.
 */
export function ReviewCardPrompt({
  card,
  flipped,
  typed,
  onTypedChange,
  onReveal,
}: {
  card: UiReviewUnit;
  flipped: boolean;
  typed: string;
  onTypedChange: (value: string) => void;
  onReveal: () => void;
}) {
  const isTypeAnswer = card.type === "type_answer";
  const typeAnswerContent =
    card.type === "type_answer" ? (card.content as TypeAnswerContent) : null;
  const imageOcclusionContent =
    card.type === "image_occlusion" ? (card.content as ImageOcclusionContent) : null;
  // The generated back joins the revealed text and the extra; show the extra
  // apart from it, as secondary content.
  const clozeContent = card.type === "cloze" ? (card.content as ClozeContent) : null;
  const clozeExtra = clozeContent?.extra;
  const isCorrect = typeAnswerContent ? matchesTypeAnswer(typed, typeAnswerContent) : false;

  if (imageOcclusionContent) {
    return (
      <ImageOcclusionReview
        content={imageOcclusionContent}
        targetId={card.subKey}
        flipped={flipped}
      />
    );
  }

  return (
    <>
      <MarkdownContent
        content={card.front}
        className="max-w-[52ch] text-pretty text-xl font-medium leading-snug text-balance"
      />

      {isTypeAnswer && (
        <div className="mt-6 w-full max-w-sm">
          <Input
            autoFocus
            value={typed}
            disabled={flipped}
            onChange={(e) => onTypedChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !flipped) {
                e.preventDefault();
                onReveal();
              }
            }}
            placeholder="Type your answer…"
            aria-label="Your answer"
            className="text-center"
          />
        </div>
      )}

      {flipped && (
        <div className="animate-flip-in flex w-full flex-col items-center">
          <div className="my-7 h-px w-16 bg-border-strong" />
          {isTypeAnswer && (
            <div
              className={cn(
                "mb-3 inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium",
                isCorrect ? "bg-review-bg text-good" : "bg-relearning-bg text-relearning",
              )}
            >
              {isCorrect ? <Check className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {isCorrect ? "Correct" : "Not quite"}
            </div>
          )}
          <MarkdownContent
            content={
              clozeContent && clozeExtra ? renderClozeText(clozeContent.text, null) : card.back
            }
            className="max-w-[52ch] text-pretty text-lg leading-relaxed text-ink/90"
          />
          {clozeExtra && (
            <MarkdownContent
              content={clozeExtra}
              className="mt-4 max-w-[52ch] text-pretty text-sm leading-relaxed text-muted"
            />
          )}
        </div>
      )}
    </>
  );
}

/**
 * The part of a rating outcome a session needs. Normal review and cram return
 * different log tables, so the session only names the log id and new version.
 */
export type SessionRateResult =
  | { status: "ok"; reviewLogId: string; version: number }
  | { status: "stale" | "ineligible"; message: string };

export type SessionUndoResult =
  | { status: "ok"; version: number }
  | { status: "stale"; message: string };

export type ReviewSessionProps = {
  /** Cards due for this session. Tag cards with `deck` to show the source. */
  queue: UiReviewUnit[];
  /** Top-of-page content — a back link or a page title. */
  header: ReactNode;
  /**
   * Secondary line under the header (e.g. due count). Pass a function to base
   * the copy on the session's remaining cards, which can briefly differ from
   * the queue when a newly unlocked card is still on screen. Session progress
   * aligns right.
   */
  subtitle?: ReactNode | ((remaining: number) => ReactNode);
  /** Deck selector rendered in the header row (top right). */
  deckSelector?: ReactNode;
  /** Action shown in the empty/done panel (typically a back button). */
  doneAction: ReactNode;
  /** Copy for the "all caught up" panel after clearing the queue. */
  doneDescription: string;
  /** Copy for the "all caught up" panel when nothing was due. */
  emptyDescription: string;
  /** Heading for the finished-session panel. */
  doneTitle?: string;
  /** Heading for the panel shown when the session starts empty. */
  emptyTitle?: string;
  /**
   * Practice sessions hide the FSRS interval line under each rating, since
   * their ratings never schedule anything.
   */
  showIntervals?: boolean;
  /**
   * Practice sessions repeat an Again card this many positions later in the
   * same session. Unset keeps normal review behavior (Again removes the card).
   */
  repeatAgainOffset?: number;
  /**
   * Practice sessions start from a fixed set of matches, so a refreshed queue
   * must not add cards mid-session. Defaults to true for normal review.
   */
  allowNewCards?: boolean;
  /** Changing this resets the session to the first card. */
  resetKey?: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  loadPreview: (
    reviewUnitId: string,
  ) => Promise<{ version: number; options: PreviewOption[] } | null>;
  onRate: (card: UiReviewUnit, rating: Grade, requestId: string) => Promise<SessionRateResult>;
  onUndo?: (entry: HistoryEntry, requestId: string) => Promise<SessionUndoResult>;
  /** False while disconnected: no new answers are submitted. */
  online?: boolean;
  loadCard?: (flashcardId: string) => Promise<UiFlashcard | undefined>;
  onEditFlashcard?: (flashcard: UiFlashcard, values: CardFormValues) => Promise<void>;
  onArchiveFlashcard?: (flashcardId: string) => Promise<void>;
  onDeleteFlashcard?: (flashcardId: string) => Promise<void>;
  loadDeleteConsequences?: (flashcardId: string) => Promise<FlashcardDeleteConsequences>;
};

export function ReviewSession({
  queue,
  header,
  subtitle,
  deckSelector,
  doneAction,
  doneDescription,
  emptyDescription,
  doneTitle = "All caught up",
  emptyTitle = "All caught up",
  showIntervals = true,
  repeatAgainOffset,
  allowNewCards = true,
  resetKey,
  isLoading = false,
  isError = false,
  onRetry,
  online = true,
  loadPreview,
  onRate,
  onUndo,
  loadCard,
  onEditFlashcard,
  onArchiveFlashcard,
  onDeleteFlashcard,
  loadDeleteConsequences,
}: ReviewSessionProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");
  const [sessionCards, setSessionCards] = useState<SessionReviewUnit[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Answers waiting for the server, saved one at a time in answer order.
  const submissionsRef = useRef<Submission[]>([]);
  const [saving, setSaving] = useState(0);
  const [saveFailing, setSaveFailing] = useState(false);
  const drainWaitersRef = useRef<(() => void)[]>([]);
  const historyRef = useRef<HistoryEntry[]>([]);
  const [staleCard, setStaleCard] = useState<{ next: UiReviewUnit | null; message: string } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editCard, setEditCard] = useState<UiFlashcard | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConsequences, setDeleteConsequences] = useState<FlashcardDeleteConsequences | null>(
    null,
  );
  const [deleteConsequencesError, setDeleteConsequencesError] = useState(false);
  const [flashcardActionPending, setCardActionPending] = useState(false);
  const queryClient = useQueryClient();

  const cards = isLoading || isError ? [] : sessionCards;
  const card = cards[index];
  const remaining = cards.filter((c) => !c.reviewed).length;
  const subtitleContent = typeof subtitle === "function" ? subtitle(remaining) : subtitle;

  const sessionRef = useRef<{
    cards: SessionReviewUnit[];
    activeTurnId: string | undefined;
  }>({ cards: sessionCards, activeTurnId: card?.turnId });
  // Missing queue entries may have been deleted elsewhere; preview returns
  // null once the unit is gone. Keep the fetcher in a ref so the merge effect
  // does not re-run on every render.
  const loadPreviewRef = useRef(loadPreview);
  const missingCheckedRef = useRef(new Set<string>());
  const onRateRef = useRef(onRate);
  // Layout effects run before any effect or event handler can read these.
  useLayoutEffect(() => {
    sessionRef.current = { cards: sessionCards, activeTurnId: card?.turnId };
    loadPreviewRef.current = loadPreview;
    onRateRef.current = onRate;
  });
  const done = !isLoading && !isError && index >= cards.length && cards.length > 0;
  const empty = !isLoading && !isError && cards.length === 0;

  const isTypeAnswer = card?.type === "type_answer";
  const typeAnswerContent =
    card?.type === "type_answer" ? (card.content as TypeAnswerContent) : null;
  const isCorrect = typeAnswerContent ? matchesTypeAnswer(typed, typeAnswerContent) : false;

  const preview = useQuery({
    queryKey: card ? previewKey(card.id, card.version) : ["review-preview", "none"],
    queryFn: () => loadPreview(card!.id),
    enabled: showIntervals && Boolean(card && !card.reviewed),
  });

  const intervalLabels = new Map<Grade, string>(
    (preview.data?.options ?? []).map((option) => [option.rating as Grade, option.label]),
  );

  const reveal = () => {
    if (!card) return;
    setFlipped(true);
  };

  const removeFromSession = useCallback((reviewUnitId: string) => {
    setSessionCards((prev) => {
      const next = prev.filter((c) => c.id !== reviewUnitId);
      setIndex((i) => {
        const adjusted = Math.min(
          i - prev.slice(0, i).filter((c) => c.id === reviewUnitId).length,
          next.length,
        );
        if (adjusted < next.length) return adjusted;
        // Removing the last card does not complete the session while an
        // earlier skipped card is still waiting.
        const firstPending = next.findIndex((c) => !c.reviewed);
        return firstPending >= 0 ? firstPending : next.length;
      });
      return next;
    });
    setHistory((h) => h.filter((entry) => entry.reviewUnitId !== reviewUnitId));
  }, []);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Resolve once every answer given so far has a server outcome. */
  const whenSaved = () =>
    submissionsRef.current.length === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => drainWaitersRef.current.push(resolve));

  /**
   * Save queued answers one at a time, in the order they were given. A request
   * whose outcome is unknown (the call failed in transit) is retried with the
   * same request id, so the server applies each answer at most once.
   */
  const savingLoopRef = useRef(false);
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
        if (result.status === "ok") {
          const entry = {
            turnId: submission.turnId,
            reviewUnitId: submission.card.id,
            reviewLogId: result.reviewLogId,
            version: result.version,
          };
          historyRef.current = [...historyRef.current, entry];
          setHistory(historyRef.current);
          setSessionCards((prev) =>
            prev.map((c) =>
              c.turnId === submission.turnId ? { ...c, version: result.version } : c,
            ),
          );
        } else {
          // Rejected (changed or deleted elsewhere, or not eligible yet). The
          // queue refresh brings the card back if it is still due.
          setNotice(`${result.message} Your answer to that card wasn't saved.`);
          removeFromSession(submission.card.id);
        }
        setSaving(submissionsRef.current.length);
      }
    } finally {
      savingLoopRef.current = false;
      const waiters = drainWaitersRef.current;
      drainWaitersRef.current = [];
      for (const resolve of waiters) resolve();
    }
  };

  /**
   * Answer the card on screen. The next card shows at once while the answer
   * saves in the background; answers save in order, and a rejected one is
   * reported and its card removed from the session.
   */
  const rate = (grade: Grade) => {
    if (!card || card.reviewed || undoing || staleCard || !online) return;
    if (submissionsRef.current.some((s) => s.turnId === card.turnId)) return;
    const requestId = crypto.randomUUID();
    submissionsRef.current.push({
      turnId: card.turnId,
      card,
      rating: grade,
      requestId,
    });
    setSaving(submissionsRef.current.length);
    setNotice(null);
    const updated = cards.map((c) => (c.turnId === card.turnId ? { ...c, reviewed: true } : c));
    let nextCards = updated;
    if (grade === 1 && repeatAgainOffset !== undefined) {
      // Practice sessions give a forgotten card another turn a few cards
      // later instead of ending it here. The copy is a new occurrence with the
      // same unit, so its answer is logged separately.
      const at = Math.min(index + 1 + repeatAgainOffset, updated.length);
      const repeat: SessionReviewUnit = {
        ...card,
        turnId: `${card.turnId}:again:${requestId}`,
        reviewed: false,
      };
      nextCards = [...updated.slice(0, at), repeat, ...updated.slice(at)];
    }
    setSessionCards(nextCards);
    setFlipped(false);
    setTyped("");
    setIndex(nextUnreviewedIndex(nextCards, index));
    void saveAnswers();
  };

  const acceptStaleCard = () => {
    if (!card || !staleCard) return;
    if (staleCard.next) {
      const next = staleCard.next;
      setSessionCards((prev) =>
        prev.map((c) => (c.turnId === card.turnId ? { ...c, ...next } : c)),
      );
    } else {
      removeFromSession(card.id);
    }
    setStaleCard(null);
    setFlipped(false);
    setTyped("");
  };

  const goPrev = () => {
    if (undoing) return;
    if (index > 0) setIndex((i) => i - 1);
  };

  const goNext = () => {
    if (undoing) return;
    if (index < cards.length - 1) setIndex((i) => i + 1);
  };

  const undoLast = async () => {
    if (!onUndo || undoing || !online) return;
    if (historyRef.current.length === 0 && submissionsRef.current.length === 0) return;
    setUndoing(true);
    setNotice(null);
    try {
      // Undo the latest answer, which may still be saving.
      await whenSaved();
      const last = historyRef.current.at(-1);
      if (!last) return;
      const result = await onUndo(last, `undo:${last.reviewLogId}`);
      historyRef.current = historyRef.current.slice(0, -1);
      setHistory(historyRef.current);
      if (result.status === "ok") {
        // Undo returns to the exact occurrence that was answered, removing
        // any waiting repeat of that unit so it cannot appear twice.
        const restored = sessionRef.current.cards
          .filter((c) => c.id !== last.reviewUnitId || c.reviewed)
          .map((c) =>
            c.turnId === last.turnId ? { ...c, version: result.version, reviewed: false } : c,
          );
        setSessionCards(restored);
        const idx = restored.findIndex((c) => c.turnId === last.turnId);
        if (idx >= 0) setIndex(idx);
        setStaleCard(null);
        setFlipped(false);
        setTyped("");
      } else {
        setNotice(result.message);
      }
    } catch {
      setNotice("Couldn't undo. Check your connection and try again.");
    } finally {
      setUndoing(false);
    }
  };

  // Edit opens from the actions menu, so the menu opening starts loading the
  // flashcard and the click usually finds it ready.
  const flashcardQuery = (flashcardId: string) => ({
    queryKey: ["review", "flashcard", flashcardId],
    queryFn: () => loadCard!(flashcardId),
    staleTime: 5_000,
  });
  const prefetchFlashcard = (open: boolean) => {
    if (open && card && loadCard) void queryClient.prefetchQuery(flashcardQuery(card.flashcardId));
  };

  const openEdit = async () => {
    if (!card || !loadCard) return;
    const loaded = await queryClient.fetchQuery(flashcardQuery(card.flashcardId));
    if (loaded) {
      setEditCard(loaded);
      setEditOpen(true);
    }
  };

  const handleEditSubmit = async (values: CardFormValues) => {
    if (!editCard || !onEditFlashcard) return;
    await onEditFlashcard(editCard, values);
    queryClient.removeQueries({ queryKey: ["review", "flashcard", editCard.id] });
    setEditOpen(false);
  };

  const handleArchive = async () => {
    if (!card || !onArchiveFlashcard || flashcardActionPending) return;
    setCardActionPending(true);
    try {
      await onArchiveFlashcard(card.flashcardId);
      setDeleteConfirmOpen(false);
      removeFromSession(card.id);
    } finally {
      setCardActionPending(false);
    }
  };

  const openDeleteConfirm = () => {
    if (!card) return;
    setDeleteConsequences(null);
    setDeleteConsequencesError(false);
    setDeleteConfirmOpen(true);
    if (loadDeleteConsequences) {
      void loadDeleteConsequences(card.flashcardId)
        .then((summary) => setDeleteConsequences(summary))
        .catch(() => setDeleteConsequencesError(true));
    }
  };

  const handleDelete = async () => {
    if (!card || !onDeleteFlashcard || flashcardActionPending) return;
    setCardActionPending(true);
    try {
      await onDeleteFlashcard(card.flashcardId);
      setDeleteConfirmOpen(false);
      removeFromSession(card.id);
    } finally {
      setCardActionPending(false);
    }
  };

  const hasCardActions = Boolean(onEditFlashcard || onArchiveFlashcard || onDeleteFlashcard);

  // Load the next cards' rating intervals ahead, so the buttons show them as
  // soon as a card appears.
  useEffect(() => {
    if (!card || !showIntervals) return;
    const upcoming = sessionRef.current.cards
      .filter((c, i) => i > index && !c.reviewed)
      .slice(0, 2);
    for (const next of upcoming) {
      void queryClient.prefetchQuery({
        queryKey: previewKey(next.id, next.version),
        queryFn: () => loadPreviewRef.current(next.id),
      });
    }
  }, [card, index, queryClient, showIntervals]);

  // Closing the tab while answers are still saving would lose them.
  useEffect(() => {
    if (saving === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saving]);

  // A new session key starts over. State resets during render; the refs reset
  // once that render commits, and the session ref follows the emptied cards.
  const [sessionKey, setSessionKey] = useState(resetKey);
  if (resetKey !== sessionKey) {
    setSessionKey(resetKey);
    setIndex(0);
    setFlipped(false);
    setTyped("");
    setSessionCards([]);
    setHistory([]);
    setStaleCard(null);
    setNotice(null);
  }
  useLayoutEffect(() => {
    missingCheckedRef.current.clear();
    historyRef.current = [];
  }, [resetKey]);

  useEffect(() => {
    // While answers are saving, a refreshed queue can still list a card that
    // was just answered; merge once the server has every answer.
    if (isLoading || isError || saving > 0 || undoing) return;
    const current = sessionRef.current;
    // The first response seeds the session even when practice sessions freeze
    // membership for the rest of the run.
    const merged = reconcileSessionCards(
      current.cards,
      queue,
      current.activeTurnId,
      allowNewCards || current.cards.length === 0,
    );
    setSessionCards(merged.cards);
    if (merged.staleActive) {
      setStaleCard({
        next: merged.staleActive,
        message: "This card was changed in another tab or device.",
      });
    }
    // A card that reappears may go missing again later (e.g. it is deleted
    // after being answered elsewhere), so forget earlier checks on presence.
    const incomingIds = new Set(queue.map((c) => c.id));
    for (const id of missingCheckedRef.current) {
      if (incomingIds.has(id)) missingCheckedRef.current.delete(id);
    }
    const unchecked = merged.missing.filter((c) => !missingCheckedRef.current.has(c.id));
    if (unchecked.length > 0) {
      void Promise.all(
        unchecked.map(async (missingCard) => {
          try {
            const preview = await loadPreviewRef.current(missingCard.id);
            missingCheckedRef.current.add(missingCard.id);
            return { id: missingCard.id, deleted: preview === null };
          } catch {
            // A transient failure is not evidence of deletion; retry on the
            // next queue poll.
            return { id: missingCard.id, deleted: false };
          }
        }),
      ).then((checked) => {
        const deleted = checked.filter((c) => c.deleted).map((c) => c.id);
        if (deleted.length === 0) return;
        for (const id of deleted) removeFromSession(id);
        setNotice("This card was deleted in another tab. It was removed from the session.");
      });
    }
  }, [isLoading, isError, queue, saving, undoing, allowNewCards, removeFromSession]);

  // Each new turn starts face-down with an empty answer.
  const [shownTurnId, setShownTurnId] = useState(card?.turnId);
  if (card?.turnId !== shownTurnId) {
    setShownTurnId(card?.turnId);
    setFlipped(false);
    setTyped("");
    setStaleCard(null);
  }

  const reviewActive = !isLoading && !isError && Boolean(card);

  // Reveal (Space), rate (1–4), and step (←/→) are app-level Commands routed
  // through the keybinding dispatcher; the bare-key-in-input suppression and
  // modal isolation are handled centrally, so these only carry domain guards.
  useScope(
    "review",
    {
      "review.flip": () => {
        if (!flipped) reveal();
      },
      "review.rate.again": () => {
        if (flipped) rate(1 as Grade);
      },
      "review.rate.hard": () => {
        if (flipped) rate(2 as Grade);
      },
      "review.rate.good": () => {
        if (flipped) rate(3 as Grade);
      },
      "review.rate.easy": () => {
        if (flipped) rate(4 as Grade);
      },
      "review.prev": () => {
        if (!flipped) goPrev();
      },
      "review.next": () => {
        if (!flipped) goNext();
      },
    },
    { enabled: reviewActive },
  );

  // Enter-to-reveal stays an intrinsic convention (it also works while the
  // type-answer field is focused, where the input submits on Enter).
  useEffect(() => {
    if (!reviewActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !flipped) {
        e.preventDefault();
        if (card) setFlipped(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewActive, flipped, card]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 sm:flex-1 [&_h1]:m-0">{header}</div>
        {deckSelector && <div className="min-w-0 w-full sm:w-auto sm:shrink-0">{deckSelector}</div>}
      </div>

      {(subtitleContent || card || isLoading) && (
        <div className="mt-1.5 flex flex-col gap-1 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          {subtitleContent && <p className="min-w-0 text-pretty text-muted">{subtitleContent}</p>}
          {isLoading && <ReviewMetaSkeleton />}
          {card && (
            <div
              className={cn(
                "flex min-w-0 items-center gap-3 font-mono text-xs uppercase tracking-wide text-muted sm:max-w-[50%] sm:justify-end",
                !subtitleContent && "sm:ml-auto",
              )}
            >
              {card.deck && card.deckId && (
                <Link
                  to="/deck/$deckId"
                  params={{ deckId: card.deckId }}
                  title={card.deck}
                  className="min-w-0 truncate rounded-sm transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {card.deck}
                </Link>
              )}
              <span className="shrink-0">
                {index + 1} / {cards.length}
              </span>
            </div>
          )}
        </div>
      )}

      {isLoading && <ReviewCardSkeleton />}

      {isError && (
        <div className="mt-10 flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-relearning-bg text-relearning">
            <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold">Review couldn&apos;t start</h2>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">
            The scheduler hit a snag building your queue.
          </p>
          <Button variant="outline" className="mt-5" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      {(empty || done) && (
        <div className="mt-16 flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-review-bg text-good">
            <CheckCircle2 className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">{done ? doneTitle : emptyTitle}</h2>
          <p className="mt-1.5 max-w-[44ch] text-pretty text-sm text-muted">
            {done ? doneDescription : emptyDescription}
          </p>
          {notice && (
            <p role="alert" className="mt-4 text-sm text-muted">
              {notice}
            </p>
          )}
          {onUndo && (history.length > 0 || saving > 0) && (
            <Button
              variant="outline"
              className="mt-5"
              busy={undoing}
              disabled={undoing || !online}
              onClick={() => void undoLast()}
              aria-label="Undo last review"
            >
              <Undo2 className="h-4 w-4" />
              Undo
            </Button>
          )}
          <div className="mt-6">{doneAction}</div>
        </div>
      )}

      {card && (
        <div className="mt-8">
          <div className="mb-8 flex items-center gap-3">
            <Progress
              value={cards.filter((c) => c.reviewed).length}
              max={cards.length}
              label="Session progress"
              className="flex-1"
            />
            {onUndo && (
              <Button
                variant="outline"
                size="sm"
                disabled={(history.length === 0 && saving === 0) || undoing || !online}
                onClick={() => void undoLast()}
                aria-label="Undo last review"
              >
                <Undo2 className="h-4 w-4" />
                Undo
              </Button>
            )}
          </div>

          {staleCard && (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-hard/50 bg-hard/10 px-4 py-3 text-sm"
            >
              <span>{staleCard.message} Your answer wasn&apos;t saved.</span>
              <Button size="sm" variant="outline" onClick={acceptStaleCard}>
                {staleCard.next ? "Show the updated card" : "Skip this card"}
              </Button>
            </div>
          )}
          {notice && !staleCard && (
            <div
              role="status"
              className="mb-4 rounded-md border border-border-strong bg-surface-sunken px-4 py-3 text-sm"
            >
              {notice}
            </div>
          )}
          {saving > 0 && (!online || saveFailing) && (
            <p role="status" className="mb-4 text-sm text-muted">
              {online
                ? "Couldn't save your last answer yet. Retrying…"
                : "Waiting for the connection to save your answers…"}
            </p>
          )}

          <div className="relative flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-border-strong bg-paper px-5 py-10 text-center sm:min-h-[300px] sm:px-10 sm:py-12">
            {hasCardActions && (
              <div className="absolute top-3 right-3">
                <DropdownMenu onOpenChange={prefetchFlashcard}>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon-sm" aria-label="Flashcard actions" />
                    }
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-40">
                    {onEditFlashcard && loadCard && (
                      <DropdownMenuItem onClick={() => void openEdit()}>
                        <Pencil className="h-4 w-4" />
                        Edit flashcard
                      </DropdownMenuItem>
                    )}
                    {onArchiveFlashcard && (
                      <DropdownMenuItem
                        disabled={flashcardActionPending}
                        onClick={() => void handleArchive()}
                      >
                        <Archive className="h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                    )}
                    {onDeleteFlashcard && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={flashcardActionPending}
                          onClick={openDeleteConfirm}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            <ReviewCardPrompt
              card={card}
              flipped={flipped}
              typed={typed}
              onTypedChange={setTyped}
              onReveal={reveal}
            />
          </div>

          {/* One height for both states, sized to the two-line rating buttons, so
              revealing the answer doesn't grow the row. */}
          <div className="mt-6 flex items-stretch gap-2 sm:h-15">
            <Button
              variant="outline"
              size="lg"
              className="h-auto shrink-0 px-3"
              disabled={index === 0 || undoing}
              onClick={goPrev}
              aria-label="Previous review unit"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="min-w-0 flex-1">
              {!flipped ? (
                <Button size="lg" className="h-15 w-full sm:h-full" onClick={reveal}>
                  {isTypeAnswer ? "Check answer" : "Show answer"}
                  <Kbd className="ml-1 border-on-accent/25 bg-ink/10 text-on-accent shadow-none max-sm:hidden">
                    {isTypeAnswer ? "Enter" : "Space"}
                  </Kbd>
                </Button>
              ) : (
                <div className="grid h-full grid-cols-4 gap-2">
                  {RATINGS.map((r) => (
                    <button
                      key={r.grade}
                      onClick={() => rate(r.grade)}
                      disabled={card.reviewed || undoing || Boolean(staleCard) || !online}
                      className={cn(
                        "flex h-15 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-sm sm:h-full sm:px-3 font-medium text-on-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                        r.bg,
                        isTypeAnswer &&
                          ((isCorrect && r.grade === 3) || (!isCorrect && r.grade === 1))
                          ? "ring-2 ring-ink ring-offset-2 ring-offset-bg"
                          : undefined,
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {r.label}
                        {/* Shortcut hints only where there's room, and a keyboard. */}
                        <Kbd className="border-on-accent/25 bg-ink/10 text-on-accent shadow-none max-sm:hidden">
                          {r.grade}
                        </Kbd>
                      </span>
                      {showIntervals && (
                        <span className="font-mono text-xs text-on-accent">
                          {intervalLabels.get(r.grade) ?? "…"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="lg"
              className="h-auto shrink-0 px-3"
              disabled={index >= cards.length - 1 || undoing}
              onClick={goNext}
              aria-label="Next review unit"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          {card.reviewed && (
            <p className="mt-3 text-center text-sm text-muted">
              Already reviewed. Use Undo to change your last answer.
            </p>
          )}
        </div>
      )}

      {editCard && onEditFlashcard && (
        <FlashcardFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onExitComplete={() => setEditCard(null)}
          mode="edit"
          reviewUnitId={editCard.id}
          initialType={editCard.type}
          initialContent={editCard.content}
          initialTags={editCard.tags}
          onSubmit={handleEditSubmit}
        />
      )}

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete flashcard?"
        description="This flashcard will be permanently hard-deleted."
      >
        <div className="space-y-3 text-sm text-muted">
          <p>
            Archive is the reversible way to set this aside. Delete removes the flashcard, its
            review units, and its review history permanently.
          </p>
          <ul className="space-y-1 rounded-md border border-border bg-surface-sunken p-3">
            <li>
              {deleteConsequencesError || !loadDeleteConsequences
                ? "Dependent count could not be loaded."
                : deleteConsequences
                  ? `${plural(deleteConsequences.dependentCount, "dependent")} will be unlocked or recomputed.`
                  : "Loading dependent count…"}
            </li>
            <li>
              {deleteConsequencesError || !loadDeleteConsequences
                ? "Review history could not be loaded."
                : formatReviewHistory(deleteConsequences)}
            </li>
          </ul>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>
            Cancel
          </Button>
          {onArchiveFlashcard && card && (
            <Button disabled={flashcardActionPending} onClick={() => void handleArchive()}>
              Archive instead
            </Button>
          )}
          <Button
            variant="destructive"
            disabled={
              flashcardActionPending || Boolean(loadDeleteConsequences && !deleteConsequences)
            }
            onClick={() => void handleDelete()}
          >
            Delete flashcard
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
