import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { BuryResult } from "@armin/backend/types";
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
  Info,
  Moon,
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
import { CardInfoDialog } from "@/components/card-info-dialog";
import { ImageOcclusionReview } from "@/components/image-occlusion-review";
import { FlashcardFormDialog } from "@/components/flashcard-form-dialog-lazy";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import { useScope } from "@/keybindings/keybindings-provider";
import type {
  FlashcardDeleteConsequences,
  Grade,
  PreviewOption,
  UiFlashcard,
  UiReviewUnit,
} from "@/types/view-models";
import { matchesTypeAnswer, renderClozeText } from "@armin/core/flashcard-rules";
import type {
  ClozeContent,
  ImageOcclusionContent,
  TypeAnswerContent,
} from "@armin/core/flashcard-types";
import type {
  HistoryEntry,
  SessionRateResult,
  SessionUndoResult,
} from "@armin/core/review-session";
import { useReviewSession } from "@/lib/use-review-session";
import { DeleteConsequencesList } from "@/components/delete-consequences-list";
import { Tooltip } from "@/components/ui/tooltip";
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
  onBury?: (flashcardId: string, requestId: string) => Promise<BuryResult>;
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
  onBury,
  onUndo,
  loadCard,
  onEditFlashcard,
  onArchiveFlashcard,
  onDeleteFlashcard,
  loadDeleteConsequences,
}: ReviewSessionProps) {
  const session = useReviewSession({
    queue,
    ready: !isLoading && !isError,
    allowNewCards,
    repeatAgainOffset,
    resetKey,
    online,
    loadPreview,
    onRate,
    onUndo,
    onBury,
  });
  const { cards, card, index, history, stale: staleCard, notice, saving, saveFailing } = session;
  const { undoing, burying } = session;
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editCard, setEditCard] = useState<UiFlashcard | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConsequences, setDeleteConsequences] = useState<FlashcardDeleteConsequences | null>(
    null,
  );
  const [deleteConsequencesError, setDeleteConsequencesError] = useState(false);
  const [flashcardActionPending, setCardActionPending] = useState(false);
  const [infoCardId, setInfoCardId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const remaining = cards.filter((c) => !c.reviewed).length;
  const subtitleContent = typeof subtitle === "function" ? subtitle(remaining) : subtitle;
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

  const resetTurn = () => {
    setFlipped(false);
    setTyped("");
  };

  const rate = (grade: Grade) => {
    if (session.rate(grade)) resetTurn();
  };

  const acceptStaleCard = () => {
    session.acceptStale();
    resetTurn();
  };

  const goPrev = () => session.step(-1);
  const goNext = () => session.step(1);

  const undoLast = async () => {
    if (await session.undoLast()) resetTurn();
  };

  const buryCard = () => session.bury();

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
      session.remove(card.id);
    } finally {
      setCardActionPending(false);
    }
  };

  const openInfo = () => {
    if (card) setInfoCardId(card.flashcardId);
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
      session.remove(card.id);
    } finally {
      setCardActionPending(false);
    }
  };

  // Load the next cards' rating intervals ahead, so the buttons show them as
  // soon as a card appears.
  // Read through a ref so this runs when the turn changes, not on every render.
  const upcomingRef = useRef({ cards, loadPreview });
  useLayoutEffect(() => {
    upcomingRef.current = { cards, loadPreview };
  });
  useEffect(() => {
    if (!card || !showIntervals) return;
    const { cards, loadPreview } = upcomingRef.current;
    const upcoming = cards.filter((c, i) => i > index && !c.reviewed).slice(0, 2);
    for (const next of upcoming) {
      void queryClient.prefetchQuery({
        queryKey: previewKey(next.id, next.version),
        queryFn: () => loadPreview(next.id),
      });
    }
  }, [card, index, queryClient, showIntervals]);

  // Each new turn starts face-down with an empty answer.
  const [shownTurnId, setShownTurnId] = useState(card?.turnId);
  if (card?.turnId !== shownTurnId) {
    setShownTurnId(card?.turnId);
    resetTurn();
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
      "review.info": () => {
        openInfo();
      },
      "review.bury": () => {
        void buryCard();
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
                <Tooltip content={card.deck} side="bottom">
                  <Link
                    to="/deck/$deckId"
                    params={{ deckId: card.deckId }}
                    className="min-w-0 truncate rounded-sm transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {card.deck}
                  </Link>
                </Tooltip>
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
            <div className="absolute top-3 right-3 flex items-center gap-1">
              <Tooltip content="Card info (I)" className="px-2.5 py-1.5">
                <Button variant="ghost" size="icon-sm" aria-label="Card info" onClick={openInfo}>
                  <Info className="h-4 w-4" />
                </Button>
              </Tooltip>
              <DropdownMenu onOpenChange={prefetchFlashcard}>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon-sm" aria-label="Flashcard actions" />}
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
                  <DropdownMenuItem onClick={openInfo}>
                    <Info className="h-4 w-4" />
                    Card info
                  </DropdownMenuItem>
                  {onBury && (
                    <DropdownMenuItem disabled={burying || !online} onClick={() => void buryCard()}>
                      <Moon className="h-4 w-4" />
                      Bury until tomorrow
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
          <DeleteConsequencesList
            consequences={deleteConsequences}
            unavailable={deleteConsequencesError || !loadDeleteConsequences}
          />
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

      <CardInfoDialog
        flashcardId={infoCardId}
        open={infoCardId !== null}
        onClose={() => setInfoCardId(null)}
      />
    </div>
  );
}
