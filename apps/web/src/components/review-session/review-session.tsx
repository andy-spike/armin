import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { BuryResult, FlagShownResult } from "@armin/backend/types";
import type {
  HistoryEntry,
  SessionRateResult,
  SessionUndoResult,
} from "@armin/core/review-session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ReviewCardSkeleton } from "@/components/page-skeletons";
import { CardInfoDialog } from "@/components/card-info-dialog";
import { FlashcardFormDialog } from "@/components/flashcard-form-dialog-lazy";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import { DeleteFlashcardDialog } from "@/components/delete-consequences-list";
import { useToast } from "@/components/ui/toast";
import { useKeybindings, useScope } from "@/keybindings/keybindings-provider";
import { errorMessage } from "@/lib/armin-client";
import { isEditableTarget } from "@/lib/keybindings/editable";
import { replayCardAudio } from "@/lib/card-audio";
import { useReviewSession } from "@/lib/use-review-session";
import type {
  FlashcardDeleteConsequences,
  Grade,
  PreviewOption,
  UiFlashcard,
  UiReviewUnit,
} from "@/types/view-models";
import { AnswerBar } from "./answer-bar";
import { CardActions } from "./card-actions";
import { ReviewCardPrompt, typeAnswerCheck } from "./card-prompt";
import { DeckLink, ReviewStatePanel, UndoButton } from "./parts";
import { SessionEndPanel, SessionErrorPanel } from "./session-end";
import { useCardContent } from "./use-card-content";

/** A unit's rating intervals change only when its schedule (version) does. */
const previewKey = (reviewUnitId: string, version: number) =>
  ["review-preview", reviewUnitId, version] as const;

/**
 * The part of a rating outcome a session needs. Normal review and cram return
 * different log tables, so the session only names the log id and new version.
 */
type ReviewSessionProps = {
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
  /**
   * Flag the concept card exercise on screen. The card stays on screen and
   * shows its next exercise; the concept is not rated.
   */
  onFlagVariant?: (card: UiReviewUnit) => Promise<FlagShownResult>;
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
  onFlagVariant,
  loadDeleteConsequences,
}: ReviewSessionProps) {
  const toast = useToast();
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
  const { cards, index, history, stale: staleCard, notice, saving, saveFailing } = session;
  const {
    descriptor,
    card,
    contents,
    loading: contentLoading,
  } = useCardContent({ cards, index, resetKey });

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
  const cardBodyRef = useRef<HTMLDivElement>(null);

  const remaining = cards.filter((c) => !c.reviewed).length;
  const subtitleContent = typeof subtitle === "function" ? subtitle(remaining) : subtitle;
  const done = !isLoading && !isError && index >= cards.length && cards.length > 0;
  const empty = !isLoading && !isError && cards.length === 0;

  const { isTypeAnswer, isCorrect } = typeAnswerCheck(card, typed);

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
      await session.removeFlashcard(card.flashcardId, () => onArchiveFlashcard(card.flashcardId));
      setDeleteConfirmOpen(false);
    } finally {
      setCardActionPending(false);
    }
  };

  const flagVariant = async () => {
    if (!card || card.reviewed || !onFlagVariant || flashcardActionPending) return;
    setCardActionPending(true);
    try {
      const result = await onFlagVariant(card);
      if (result.status === "ok") {
        session.replace(card.turnId, result.version);
        toast({
          tone: "success",
          title: "Exercise flagged",
          description: "It won't be shown again. Here is another one.",
        });
      } else {
        toast({ tone: "error", title: "Couldn't flag this exercise", description: result.message });
      }
    } catch (error) {
      toast({
        tone: "error",
        title: "Couldn't flag this exercise",
        description: errorMessage(error),
      });
    } finally {
      setCardActionPending(false);
    }
  };

  const { keymap } = useKeybindings();
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
      await session.removeFlashcard(card.flashcardId, () => onDeleteFlashcard(card.flashcardId));
      setDeleteConfirmOpen(false);
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
        if (card && !flipped) goPrev();
      },
      "review.next": () => {
        if (card && !flipped) goNext();
      },
      "review.info": () => {
        openInfo();
      },
      "review.bury": () => {
        void buryCard();
      },
      "review.undo": () => {
        void undoLast();
      },
      "review.replayAudio": () => {
        replayCardAudio();
      },
    },
    { enabled: reviewActive || done },
  );

  // Enter-to-reveal stays an intrinsic convention (it also works while the
  // type-answer field is focused, where the input submits on Enter). The page
  // itself never scrolls, so the up and down arrows scroll a long card.
  useEffect(() => {
    if (!reviewActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !flipped) {
        e.preventDefault();
        if (card) setFlipped(true);
        return;
      }
      const lineDirection = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (lineDirection === 0 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isEditableTarget(e.target) || e.defaultPrevented) return;
      const body = cardBodyRef.current;
      if (!body || body.scrollHeight <= body.clientHeight) return;
      e.preventDefault();
      body.scrollBy({ top: lineDirection * 64, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewActive, flipped, card]);

  const reviewedCount = cards.filter((c) => c.reviewed).length;

  return (
    // The review frame never scrolls. The header sits on top, the card fills
    // and centers in the space between, and the answer controls stay pinned to
    // the bottom edge, so every action keeps its place from card to card. Only
    // a card too long for the space scrolls, inside itself.
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 pt-3 sm:px-6 sm:pt-5">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1 [&_h1]:m-0">
          {header}
          {subtitleContent && (
            <p className="mt-1 text-pretty text-sm text-muted max-sm:hidden">{subtitleContent}</p>
          )}
        </div>
        {deckSelector && <div className="min-w-0 max-w-[55%] shrink-0 sm:pt-1">{deckSelector}</div>}
      </div>

      {(isLoading || contentLoading) && <ReviewCardSkeleton />}

      {descriptor && !card && contents.isError && (
        <ReviewStatePanel>
          <p>Couldn&apos;t load this card.</p>
          <Button variant="outline" onClick={() => void contents.refetch()}>
            Try again
          </Button>
        </ReviewStatePanel>
      )}
      {descriptor &&
        !card &&
        !contents.isLoading &&
        !contents.isError &&
        contents.data &&
        !contentLoading && (
          <ReviewStatePanel>
            <p>This card changed or is no longer available.</p>
            <Button variant="outline" onClick={() => session.remove(descriptor.id)}>
              Load next card
            </Button>
          </ReviewStatePanel>
        )}
      {isError && <SessionErrorPanel onRetry={onRetry} />}

      {(empty || done) && (
        <SessionEndPanel
          done={done}
          title={done ? doneTitle : emptyTitle}
          description={done ? doneDescription : emptyDescription}
          notice={notice}
          action={doneAction}
          undo={
            onUndo && (history.length > 0 || saving > 0)
              ? {
                  binding: keymap["review.undo"],
                  busy: undoing,
                  disabled: undoing || !online,
                  onClick: () => void undoLast(),
                }
              : undefined
          }
        />
      )}

      {card && (
        <>
          <div className="mt-2 flex h-8 shrink-0 items-center gap-3">
            <Progress
              value={reviewedCount}
              max={cards.length}
              label="Session progress"
              className="flex-1"
            />
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
              <span className="sr-only">Card </span>
              {index + 1} / {cards.length}
            </span>
            {onUndo && (
              <UndoButton
                binding={keymap["review.undo"]}
                variant="ghost"
                size="sm"
                className="-mr-2"
                disabled={(history.length === 0 && saving === 0) || undoing || !online}
                onClick={() => void undoLast()}
              />
            )}
          </div>

          {(staleCard || notice || (saving > 0 && (!online || saveFailing))) && (
            <div className="mt-3 shrink-0 space-y-2">
              {staleCard && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-hard/50 bg-hard/10 px-4 py-3 text-sm"
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
                  className="rounded-md border border-border-strong bg-surface-sunken px-4 py-3 text-sm"
                >
                  {notice}
                </div>
              )}
              {saving > 0 && (!online || saveFailing) && (
                <p role="status" className="text-sm text-muted">
                  {online
                    ? "Couldn't save your last answer yet. Retrying…"
                    : "Waiting for the connection to save your answers…"}
                </p>
              )}
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col py-3 sm:py-4">
            <article
              aria-label="Flashcard"
              className="flex min-h-0 flex-1 flex-col rounded-xl border border-border-strong bg-paper"
            >
              <div className="flex shrink-0 items-center gap-3 py-2 pr-2 pl-4 font-mono text-xs uppercase tracking-wide text-muted sm:pl-5">
                <div className="flex min-w-0 flex-1">
                  {card.deck && card.deckId && <DeckLink deckId={card.deckId} name={card.deck} />}
                </div>
                <CardActions
                  keymap={keymap}
                  online={online}
                  burying={burying}
                  actionPending={flashcardActionPending}
                  onInfo={openInfo}
                  onMenuOpenChange={prefetchFlashcard}
                  onEdit={onEditFlashcard && loadCard ? () => void openEdit() : undefined}
                  onBury={onBury ? () => void buryCard() : undefined}
                  onFlagVariant={
                    onFlagVariant && card.type === "concept" && !card.reviewed
                      ? () => void flagVariant()
                      : undefined
                  }
                  onArchive={onArchiveFlashcard ? () => void handleArchive() : undefined}
                  onDelete={onDeleteFlashcard ? openDeleteConfirm : undefined}
                />
              </div>

              {/* Remounted per card, so a long card never opens scrolled. */}
              <div
                key={card.turnId}
                ref={cardBodyRef}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-b-xl [mask-image:linear-gradient(to_bottom,transparent,black_1rem,black_calc(100%-2.5rem),transparent)]"
              >
                {/* The edges fade so a long card reads as scrollable. Bottom padding
                    mirrors the action strip, so short content sits at the card's
                    optical center and the last line clears the fade. */}
                <div className="flex min-h-full flex-col items-center justify-center px-5 pt-4 pb-12 text-center sm:px-12">
                  <ReviewCardPrompt
                    card={card}
                    flipped={flipped}
                    typed={typed}
                    onTypedChange={setTyped}
                    onReveal={reveal}
                  />
                </div>
              </div>
            </article>
          </div>

          <AnswerBar
            keymap={keymap}
            flipped={flipped}
            reviewed={card.reviewed}
            isTypeAnswer={isTypeAnswer}
            isCorrect={isCorrect}
            canGoBack={index > 0 && !undoing}
            canGoForward={index < cards.length - 1 && !undoing}
            rateDisabled={card.reviewed || undoing || Boolean(staleCard) || !online}
            showIntervals={showIntervals}
            intervalLabels={intervalLabels}
            onPrev={goPrev}
            onNext={goNext}
            onReveal={reveal}
            onRate={rate}
          />
        </>
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

      <DeleteFlashcardDialog
        open={deleteConfirmOpen}
        consequences={deleteConsequences}
        consequencesUnavailable={deleteConsequencesError || !loadDeleteConsequences}
        waitForConsequences={Boolean(loadDeleteConsequences)}
        pending={flashcardActionPending}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void handleDelete()}
        onArchiveInstead={onArchiveFlashcard && card ? () => void handleArchive() : undefined}
      />

      <CardInfoDialog
        flashcardId={infoCardId}
        open={infoCardId !== null}
        onClose={() => setInfoCardId(null)}
      />
    </div>
  );
}
