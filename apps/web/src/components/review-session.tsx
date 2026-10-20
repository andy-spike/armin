import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { RateResult, UndoResult } from "@armin/backend/types";
import { useQuery } from "@tanstack/react-query";
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
import { reviewKeys } from "@/lib/armin-query";
import { useScope } from "@/keybindings/keybindings-provider";
import type {
  FlashcardDeleteConsequences,
  Grade,
  PreviewOption,
} from "@/types/window";
import type { UiFlashcard, UiReviewUnit } from "@/types/view-models";
import { matchesTypeAnswer } from "@armin/core/flashcard-rules";
import type {
  ImageOcclusionContent,
  TypeAnswerContent,
} from "@armin/core/flashcard-types";
import { cn } from "@/lib/utils";

const RATINGS: {
  grade: Grade;
  label: string;
  bg: string;
}[] = [
  { grade: 1, label: "Again", bg: "bg-again hover:bg-again-deep" },
  { grade: 2, label: "Hard", bg: "bg-hard hover:bg-hard-deep" },
  { grade: 3, label: "Good", bg: "bg-good hover:bg-good-deep" },
  { grade: 4, label: "Easy", bg: "bg-easy hover:bg-easy-deep" },
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

/**
 * Merge a fresh queue into the running session. Cards not yet on screen take
 * the latest data, new due cards are appended, and the card being answered
 * keeps the prompt the user is looking at: if it changed elsewhere it is
 * flagged stale instead of being swapped under them.
 */
function reconcileSessionCards(
  current: UiReviewUnit[],
  incoming: UiReviewUnit[],
  activeId: string | undefined,
): { cards: UiReviewUnit[]; staleActive: UiReviewUnit | null } {
  const incomingById = new Map(incoming.map((c) => [c.id, c]));
  const currentIds = new Set(current.map((c) => c.id));
  let staleActive: UiReviewUnit | null = null;
  const updated = current.map((c) => {
    const next = incomingById.get(c.id);
    if (!next) return c;
    if (c.id === activeId && next.version !== c.version) {
      staleActive = next;
      return c;
    }
    return next;
  });
  const appended = incoming.filter((c) => !currentIds.has(c.id));
  return { cards: [...updated, ...appended], staleActive };
}

type HistoryEntry = {
  reviewUnitId: string;
  reviewLogId: string;
  version: number;
};

type PendingRating = { cardId: string; rating: Grade; requestId: string };

export type ReviewSessionProps = {
  /** Cards due for this session. Tag cards with `deck` to show the source. */
  queue: UiReviewUnit[];
  /** Top-of-page content — a back link or a page title. */
  header: ReactNode;
  /** Secondary line under the header (e.g. due count). Session progress aligns right. */
  subtitle?: ReactNode;
  /** Deck selector rendered in the header row (top right). */
  deckSelector?: ReactNode;
  /** Action shown in the empty/done panel (typically a back button). */
  doneAction: ReactNode;
  /** Copy for the "all caught up" panel after clearing the queue. */
  doneDescription: string;
  /** Copy for the "all caught up" panel when nothing was due. */
  emptyDescription: string;
  /** Changing this resets the session to the first card. */
  resetKey?: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  loadPreview: (reviewUnitId: string) => Promise<{ version: number; options: PreviewOption[] } | null>;
  onRate: (card: UiReviewUnit, rating: Grade, requestId: string) => Promise<RateResult>;
  onUndo?: (entry: HistoryEntry, requestId: string) => Promise<UndoResult>;
  /** False while disconnected: no new answers are submitted. */
  online?: boolean;
  loadCard?: (flashcardId: string) => Promise<UiFlashcard | undefined>;
  onEditFlashcard?: (
    flashcard: UiFlashcard,
    values: CardFormValues,
  ) => Promise<void>;
  onArchiveFlashcard?: (flashcardId: string) => Promise<void>;
  onDeleteFlashcard?: (flashcardId: string) => Promise<void>;
  loadDeleteConsequences?: (
    flashcardId: string,
  ) => Promise<FlashcardDeleteConsequences>;
};

export function ReviewSession({
  queue,
  header,
  subtitle,
  deckSelector,
  doneAction,
  doneDescription,
  emptyDescription,
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
  const [rating, setRating] = useState<Grade | null>(null);
  const [typed, setTyped] = useState("");
  const [sessionCards, setSessionCards] = useState<UiReviewUnit[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pending, setPending] = useState<PendingRating | null>(null);
  const [staleCard, setStaleCard] = useState<{ next: UiReviewUnit | null; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editCard, setEditCard] = useState<UiFlashcard | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConsequences, setDeleteConsequences] =
    useState<FlashcardDeleteConsequences | null>(null);
  const [deleteConsequencesError, setDeleteConsequencesError] = useState(false);
  const [flashcardActionPending, setCardActionPending] = useState(false);

  const cards = isLoading || isError ? [] : sessionCards;
  const card = cards[index];
  const done =
    !isLoading && !isError && index >= cards.length && cards.length > 0;
  const empty = !isLoading && !isError && cards.length === 0;

  const isTypeAnswer = card?.type === "type_answer";
  const typeAnswerContent =
    card?.type === "type_answer" ? (card.content as TypeAnswerContent) : null;
  const imageOcclusionContent =
    card?.type === "image_occlusion"
      ? (card.content as ImageOcclusionContent)
      : null;
  const isCorrect = typeAnswerContent
    ? matchesTypeAnswer(typed, typeAnswerContent)
    : false;

  const preview = useQuery({
    queryKey: card
      ? [...reviewKeys.preview(card.id), card.version]
      : ["review", "preview", "none"],
    queryFn: () => loadPreview(card!.id),
    enabled: Boolean(card),
  });

  const intervalLabels = new Map<Grade, string>(
    (preview.data?.options ?? []).map((option) => [
      option.rating as Grade,
      option.label,
    ]),
  );

  const reveal = () => {
    if (!card) return;
    setFlipped(true);
  };

  const removeFromSession = useCallback((reviewUnitId: string) => {
    setSessionCards((prev) => {
      const removeIdx = prev.findIndex((c) => c.id === reviewUnitId);
      const next = prev.filter((c) => c.id !== reviewUnitId);
      setIndex((i) => {
        if (removeIdx < 0) return i;
        if (i > removeIdx) return i - 1;
        return Math.min(i, Math.max(0, next.length - 1));
      });
      return next;
    });
    setHistory((h) => h.filter((entry) => entry.reviewUnitId !== reviewUnitId));
  }, []);

  const setCardVersion = (reviewUnitId: string, version: number) =>
    setSessionCards((prev) =>
      prev.map((c) => (c.id === reviewUnitId ? { ...c, version } : c)),
    );

  /**
   * Submit an answer for the card on screen. The request id is reused if the
   * same answer is retried, so an uncertain first attempt can never apply
   * twice. While a submission is in flight (including across a dropped
   * connection) the buttons stay disabled until the server's outcome arrives.
   */
  const rate = async (grade: Grade) => {
    if (!card || rating || staleCard) return;
    if (!online && !pending) return;
    const attempt =
      pending && pending.cardId === card.id && pending.rating === grade
        ? pending
        : { cardId: card.id, rating: grade, requestId: crypto.randomUUID() };
    setPending(attempt);
    setRating(grade);
    setNotice(null);
    try {
      const result = await onRate(card, grade, attempt.requestId);
      setPending(null);
      if (result.status === "ok") {
        setHistory((h) => [
          ...h,
          { reviewUnitId: card.id, reviewLogId: result.reviewLogId, version: result.version },
        ]);
        setCardVersion(card.id, result.version);
        setFlipped(false);
        setTyped("");
        setIndex((i) => i + 1);
      } else if (result.status === "stale") {
        setStaleCard({ next: null, message: result.message });
      } else {
        setNotice(result.message);
        removeFromSession(card.id);
      }
    } catch {
      // Outcome unknown (e.g. the request failed in transit). Keep the
      // request id so "Try again" resubmits the same answer, not a new one.
      setNotice("Couldn't confirm that answer was saved. Try again to resubmit the same answer.");
    } finally {
      setRating(null);
    }
  };

  const acceptStaleCard = () => {
    if (!card || !staleCard) return;
    if (staleCard.next) {
      const next = staleCard.next;
      setSessionCards((prev) => prev.map((c) => (c.id === next.id ? next : c)));
    } else {
      removeFromSession(card.id);
    }
    setStaleCard(null);
    setPending(null);
    setFlipped(false);
    setTyped("");
  };

  const goPrev = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  const goNext = () => {
    if (index < cards.length - 1) setIndex((i) => i + 1);
  };

  const undoLast = async () => {
    if (!onUndo || history.length === 0 || undoing || !online) return;
    const last = history[history.length - 1]!;
    setUndoing(true);
    setNotice(null);
    try {
      const result = await onUndo(last, `undo:${last.reviewLogId}`);
      setHistory((h) => h.slice(0, -1));
      if (result.status === "ok") {
        setCardVersion(last.reviewUnitId, result.version);
        const idx = sessionCards.findIndex((c) => c.id === last.reviewUnitId);
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

  const openEdit = async () => {
    if (!card || !loadCard) return;
    const loaded = await loadCard(card.flashcardId);
    if (loaded) {
      setEditCard(loaded);
      setEditOpen(true);
    }
  };

  const handleEditSubmit = async (values: CardFormValues) => {
    if (!editCard || !onEditFlashcard) return;
    await onEditFlashcard(editCard, values);
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

  const hasCardActions = Boolean(
    onEditFlashcard || onArchiveFlashcard || onDeleteFlashcard,
  );

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
    setTyped("");
    setSessionCards([]);
    setHistory([]);
    setStaleCard(null);
    setPending(null);
    setNotice(null);
  }, [resetKey]);

  const activeIdRef = useRef<string | undefined>(undefined);
  activeIdRef.current = card?.id;

  useEffect(() => {
    if (isLoading || isError) return;
    let staleNext: UiReviewUnit | null = null;
    setSessionCards((prev) => {
      if (prev.length === 0) return queue;
      const merged = reconcileSessionCards(prev, queue, activeIdRef.current);
      staleNext = merged.staleActive;
      return merged.cards;
    });
    if (staleNext) {
      setStaleCard({
        next: staleNext,
        message: "This card was changed in another tab or device.",
      });
    }
  }, [isLoading, isError, queue]);

  useEffect(() => {
    setFlipped(false);
    setTyped("");
    setStaleCard(null);
  }, [card?.id]);

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
        if (flipped) void rate(1 as Grade);
      },
      "review.rate.hard": () => {
        if (flipped) void rate(2 as Grade);
      },
      "review.rate.good": () => {
        if (flipped) void rate(3 as Grade);
      },
      "review.rate.easy": () => {
        if (flipped) void rate(4 as Grade);
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
        reveal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewActive, flipped]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 [&_h1]:m-0">{header}</div>
        {deckSelector && <div className="shrink-0">{deckSelector}</div>}
      </div>

      {(subtitle || card || isLoading) && (
        <div
          className={cn(
            "mt-1.5 flex items-baseline gap-4 text-sm",
            subtitle && "justify-between",
          )}
        >
          {subtitle && <p className="min-w-0 text-muted">{subtitle}</p>}
          {isLoading && <ReviewMetaSkeleton />}
          {card && (
            <div
              className={cn(
                "flex shrink-0 items-center gap-3 font-mono text-xs uppercase tracking-wide text-muted",
                !subtitle && "ml-auto",
              )}
            >
              {card.deck && card.deckId && (
                <Link
                  to="/deck/$deckId"
                  params={{ deckId: card.deckId }}
                  className="rounded-sm transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {card.deck}
                </Link>
              )}
              <span>
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
          <h2 className="text-xl font-semibold tracking-tight">
            All caught up
          </h2>
          <p className="mt-1.5 max-w-[44ch] text-pretty text-sm text-muted">
            {done ? doneDescription : emptyDescription}
          </p>
          {notice && <p role="alert" className="mt-4 text-sm text-muted">{notice}</p>}
          {onUndo && history.length > 0 && (
            <Button variant="outline" className="mt-5" busy={undoing}
              disabled={undoing || !online} onClick={() => void undoLast()}
              aria-label="Undo last review">
              <Undo2 className="h-4 w-4" />Undo
            </Button>
          )}
          <div className="mt-6">{doneAction}</div>
        </div>
      )}

      {card && (
        <div className="mt-8">
          <div className="mb-8 flex items-center gap-3">
            <Progress value={index} max={cards.length} className="flex-1" />
            {onUndo && (
              <Button
                variant="outline"
                size="sm"
                disabled={history.length === 0 || undoing || !online}
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
              <span>
                {staleCard.message} Your answer wasn&apos;t saved.
              </span>
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
          {pending && rating === null && !staleCard && (
            <div className="mb-4 flex justify-end">
              <Button size="sm" variant="outline" disabled={!online} onClick={() => void rate(pending.rating)}>
                Try again
              </Button>
            </div>
          )}
          {pending && rating !== null && !online && (
            <p role="status" className="mb-4 text-sm text-muted">
              Waiting for the connection to confirm your answer…
            </p>
          )}

          <div className="relative flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-border-strong bg-paper px-5 py-10 text-center sm:min-h-[300px] sm:px-10 sm:py-12">
            {hasCardActions && (
              <div className="absolute top-3 right-3">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Flashcard actions"
                      />
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

            {imageOcclusionContent ? (
              <ImageOcclusionReview
                content={imageOcclusionContent}
                targetId={card.subKey}
                flipped={flipped}
              />
            ) : (
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
                      onChange={(e) => setTyped(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !flipped) {
                          e.preventDefault();
                          reveal();
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
                          isCorrect
                            ? "bg-review-bg text-good"
                            : "bg-relearning-bg text-relearning",
                        )}
                      >
                        {isCorrect ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        {isCorrect ? "Correct" : "Not quite"}
                      </div>
                    )}
                    <MarkdownContent
                      content={card.back}
                      className="max-w-[52ch] text-pretty text-lg leading-relaxed text-ink/90"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-6 flex items-stretch gap-2">
            <Button
              variant="outline"
              size="lg"
              className="shrink-0 px-3"
              disabled={index === 0}
              onClick={goPrev}
              aria-label="Previous review unit"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="min-w-0 flex-1">
              {!flipped ? (
                <Button size="lg" className="w-full" onClick={reveal}>
                  {isTypeAnswer ? "Check answer" : "Show answer"}
                  <Kbd className="ml-1 border-on-accent/25 bg-on-accent/10 text-on-accent shadow-none">
                    {isTypeAnswer ? "Enter" : "Space"}
                  </Kbd>
                </Button>
              ) : (
                <div className="grid h-full grid-cols-2 gap-2 sm:grid-cols-4">
                  {RATINGS.map((r) => (
                    <button
                      key={r.grade}
                      onClick={() => void rate(r.grade)}
                      disabled={rating !== null || Boolean(staleCard) || (!online && !pending)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-0.5 rounded-md px-3 py-2.5 text-sm font-medium text-on-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                        r.bg,
                        isTypeAnswer &&
                          ((isCorrect && r.grade === 3) ||
                            (!isCorrect && r.grade === 1))
                          ? "ring-2 ring-ink ring-offset-2 ring-offset-bg"
                          : undefined,
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {r.label}
                        <Kbd className="border-on-accent/25 bg-on-accent/10 text-on-accent shadow-none">
                          {r.grade}
                        </Kbd>
                      </span>
                      <span className="font-mono text-xs text-on-accent/85">
                        {intervalLabels.get(r.grade) ?? "…"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="lg"
              className="shrink-0 px-3"
              disabled={index >= cards.length - 1}
              onClick={goNext}
              aria-label="Next review unit"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
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
            Archive is the reversible way to set this aside. Delete removes the
            flashcard, its review units, and its review history permanently.
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
            <Button
              disabled={flashcardActionPending}
              onClick={() => void handleArchive()}
            >
              Archive instead
            </Button>
          )}
          <Button
            variant="destructive"
            disabled={
              flashcardActionPending ||
              Boolean(loadDeleteConsequences && !deleteConsequences)
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
