import { convexQuery } from "@convex-dev/react-query";
import { api } from "@armin/backend/api";
import type { Id } from "@armin/backend/types";
import { toUiReviewUnit } from "@/types/view-models";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { KeybindingHint } from "@/components/keybinding-hint";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Tooltip } from "@/components/ui/tooltip";
import { useIsTruncated } from "@/components/ui/truncated-label";
import { Progress } from "@/components/ui/progress";
import { ReviewCardSkeleton } from "@/components/page-skeletons";
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
import { useKeybindings, useScope } from "@/keybindings/keybindings-provider";
import { isEditableTarget } from "@/lib/keybindings/editable";
import { formatBinding } from "@/lib/keybindings/keys";
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

/** The rebindable command behind each rating button's key hint. */
const RATING_COMMANDS: Record<Grade, string> = {
  1: "review.rate.again",
  2: "review.rate.hard",
  3: "review.rate.good",
  4: "review.rate.easy",
};

/** A tooltip line naming an action and its current key binding. */
function ShortcutLabel({ label, binding }: { label: string; binding?: string }) {
  return (
    <span className="flex items-center gap-2">
      {label}
      {binding && <KeybindingHint binding={binding} />}
    </span>
  );
}

/** A menu item's current key binding, aligned to the item's right edge. */
function MenuShortcut({ binding }: { binding?: string }) {
  if (!binding) return null;
  return (
    <span className="ml-auto pl-4 font-mono text-xs text-muted">{formatBinding(binding)}</span>
  );
}

/** Centers an empty, finished, or error panel in the review frame. */
function ReviewStatePanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-6 sm:pb-16">
      <div className="flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
        {children}
      </div>
    </div>
  );
}

/** A unit's rating intervals change only when its schedule (version) does. */
const previewKey = (reviewUnitId: string, version: number) =>
  ["review-preview", reviewUnitId, version] as const;

/** The current card's deck, with its full name in a tooltip when clipped. */
function DeckLink({ deckId, name }: { deckId: string; name: string }) {
  const { ref, truncated } = useIsTruncated<HTMLAnchorElement>();
  return (
    <Tooltip content={name} disabled={!truncated} className="px-2.5 py-1.5">
      <Link
        ref={ref}
        to="/deck/$deckId"
        params={{ deckId }}
        className="min-w-0 truncate rounded-sm transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {name}
      </Link>
    </Tooltip>
  );
}

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
        imageLoading="eager"
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
        <div className="flex w-full flex-col items-center">
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
            imageLoading="eager"
            content={
              clozeContent && clozeExtra ? renderClozeText(clozeContent.text, null) : card.back
            }
            className="max-w-[52ch] text-pretty text-lg leading-relaxed text-ink/90"
          />
          {clozeExtra && (
            <MarkdownContent
              imageLoading="eager"
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
  const {
    cards,
    card: descriptor,
    index,
    history,
    stale: staleCard,
    notice,
    saving,
    saveFailing,
  } = session;
  const contentWindow = cards.slice(index, index + 8);
  const contents = useQuery({
    ...convexQuery(api.review.items, {
      ids: contentWindow.map((item) => item.id as Id<"reviewUnits">),
    }),
    enabled: Boolean(descriptor && descriptor.hydrated === false),
    gcTime: 30_000,
  });
  // A displayed version keeps its content while reactive updates arrive.
  const [contentCache, setContentCache] = useState(() => ({
    resetKey,
    source: undefined as typeof contents.data,
    cards: new Map<string, UiReviewUnit>(),
  }));
  if (contentCache.resetKey !== resetKey || contentCache.source !== contents.data) {
    const next =
      contentCache.resetKey === resetKey
        ? new Map(contentCache.cards)
        : new Map<string, UiReviewUnit>();
    for (const item of contents.data ?? []) {
      const key = `${item.reviewUnitId}:${item.version}`;
      if (!next.has(key)) next.set(key, toUiReviewUnit(item));
    }
    setContentCache({ resetKey, source: contents.data, cards: next });
  }
  const hydratedCards = contentCache.cards;
  const card = useMemo(() => {
    if (descriptor?.hydrated !== false) return descriptor;
    const hydrated = hydratedCards.get(`${descriptor.id}:${descriptor.version}`);
    return hydrated ? { ...descriptor, ...hydrated } : undefined;
  }, [descriptor, hydratedCards]);
  const contentLoading = Boolean(descriptor && !card && !contents.isError && !contents.data);

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
  const keyLabel = (commandId: string) => formatBinding(keymap[commandId] ?? "");
  const onAccentKbd = "border-on-accent/25 bg-ink/10 text-on-accent shadow-none max-sm:hidden";

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
      {isError && (
        <ReviewStatePanel>
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
        </ReviewStatePanel>
      )}

      {(empty || done) && (
        <ReviewStatePanel>
          {/* Finishing a session is the day's one completion moment, so it
              settles in; opening onto an empty queue does not. */}
          <div
            className={cn(
              "mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-review-bg text-good",
              done && "animate-settle",
            )}
          >
            <CheckCircle2 className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <h2
            className={cn(
              "text-xl font-semibold tracking-tight",
              done && "animate-rise-sm [--animate-delay:60ms]",
            )}
          >
            {done ? doneTitle : emptyTitle}
          </h2>
          <p
            className={cn(
              "mt-1.5 max-w-[44ch] text-pretty text-sm text-muted",
              done && "animate-rise-sm [--animate-delay:120ms]",
            )}
          >
            {done ? doneDescription : emptyDescription}
          </p>
          {notice && (
            <p role="alert" className="mt-4 text-sm text-muted">
              {notice}
            </p>
          )}
          {onUndo && (history.length > 0 || saving > 0) && (
            <Tooltip
              content={<ShortcutLabel label="Undo last answer" binding={keymap["review.undo"]} />}
            >
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
            </Tooltip>
          )}
          <div className="mt-6">{doneAction}</div>
        </ReviewStatePanel>
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
              <Tooltip
                content={<ShortcutLabel label="Undo last answer" binding={keymap["review.undo"]} />}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-2"
                  disabled={(history.length === 0 && saving === 0) || undoing || !online}
                  onClick={() => void undoLast()}
                  aria-label="Undo last review"
                >
                  <Undo2 className="h-4 w-4" />
                  Undo
                </Button>
              </Tooltip>
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
                <div className="flex shrink-0 items-center gap-1">
                  <Tooltip
                    content={<ShortcutLabel label="Card info" binding={keymap["review.info"]} />}
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Card info"
                      onClick={openInfo}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                  <DropdownMenu onOpenChange={prefetchFlashcard}>
                    <Tooltip content="Flashcard actions">
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" aria-label="Flashcard actions" />
                        }
                      >
                        <EllipsisVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="min-w-44">
                      {onEditFlashcard && loadCard && (
                        <DropdownMenuItem onClick={() => void openEdit()}>
                          <Pencil className="h-4 w-4" />
                          Edit flashcard
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={openInfo}>
                        <Info className="h-4 w-4" />
                        Card info
                        <MenuShortcut binding={keymap["review.info"]} />
                      </DropdownMenuItem>
                      {onBury && (
                        <DropdownMenuItem
                          disabled={burying || !online}
                          onClick={() => void buryCard()}
                        >
                          <Moon className="h-4 w-4" />
                          Bury until tomorrow
                          <MenuShortcut binding={keymap["review.bury"]} />
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

          <div className="shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5">
            {card.reviewed && (
              <p className="mb-3 text-center text-sm text-muted">
                Already reviewed. Use Undo to change your last answer.
              </p>
            )}
            {/* One height for both states, sized to the two-line rating buttons,
                so revealing the answer doesn't move anything. */}
            <div className="flex h-12 items-stretch gap-2">
              <Tooltip
                content={<ShortcutLabel label="Previous card" binding={keymap["review.prev"]} />}
              >
                <Button
                  variant="outline"
                  size="lg"
                  className="h-full w-12 shrink-0 px-0"
                  disabled={index === 0 || undoing}
                  onClick={goPrev}
                  aria-label="Previous review unit"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </Tooltip>

              <div className="min-w-0 flex-1">
                {!flipped ? (
                  <Button size="lg" className="h-full w-full" onClick={reveal}>
                    {isTypeAnswer ? "Check answer" : "Show answer"}
                    <Kbd className={cn("ml-1", onAccentKbd)}>
                      {isTypeAnswer ? "Enter" : keyLabel("review.flip")}
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
                          "flex h-full min-w-0 flex-col items-center justify-center gap-0 rounded-md px-1 text-sm leading-tight font-medium text-on-accent transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-default disabled:opacity-60 sm:px-3",
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
                          <Kbd className={onAccentKbd}>{keyLabel(RATING_COMMANDS[r.grade])}</Kbd>
                        </span>
                        {showIntervals && (
                          <span className="font-mono text-[0.6875rem] text-on-accent/90">
                            {intervalLabels.get(r.grade) ?? "…"}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Tooltip
                content={<ShortcutLabel label="Next card" binding={keymap["review.next"]} />}
              >
                <Button
                  variant="outline"
                  size="lg"
                  className="h-full w-12 shrink-0 px-0"
                  disabled={index >= cards.length - 1 || undoing}
                  onClick={goNext}
                  aria-label="Next review unit"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Tooltip>
            </div>
          </div>
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
