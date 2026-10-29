import { createFileRoute, Link } from "@tanstack/react-router";
import { cn, plural } from "@/lib/utils";
import { armin, errorMessage, newRequestId } from "@/lib/armin-client";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, AlertTriangle, Ellipsis, Upload, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Progress } from "@/components/ui/progress";
import { DeckGridSkeleton } from "@/components/page-skeletons";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewHeatmap } from "@/components/review-heatmap";
import { SortControl } from "@/components/sort-control";
import { DeckActionItems, useDeckActions } from "@/components/deck-actions";
import { Tooltip } from "@/components/ui/tooltip";
import { ClampedLabel } from "@/components/ui/truncated-label";
import { useToast } from "@/components/ui/toast";
import { DECK_SORT_OPTIONS, sortDecks, type DeckSortKey } from "@/lib/sort-decks";
import type { UiDeck } from "@/types/view-models";
import { useStudyClock } from "@/lib/study-clock";
import {
  decksQuery as decksQueryOptions,
  prefetchDeckPage,
  prefetchDecksPage,
  statsHeatmapQuery,
} from "@/lib/queries";
import { forgetEdit, requestCreate, useShownDecks } from "@/lib/pending-deck-edits";
import { useDeckPinnedAt } from "@/lib/pending-pins";
import { STATS_COMPACT_HEATMAP_WEEKS } from "@armin/core/stats";
import type { StatsHeatmap } from "@armin/backend/types";

function DecksPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [closingAfterCreate, setClosingAfterCreate] = useState(false);
  const [sort, setSort] = useState<DeckSortKey>("name-asc");
  // One request id per create dialog, so a retried submit can't add two decks.
  const createRequestId = useRef(newRequestId());

  const now = useStudyClock();
  const decksQuery = useQuery(decksQueryOptions(now));
  const deckActions = useDeckActions();

  const shownDecks = useShownDecks(decksQuery.data);
  const decks = shownDecks ?? [];
  const heatmapQuery = useQuery({
    ...statsHeatmapQuery(STATS_COMPACT_HEATMAP_WEEKS, now),
    enabled: decks.length > 0,
  });
  const sortedDecks = useMemo(() => sortDecks(shownDecks ?? [], sort), [shownDecks, sort]);

  // The new deck shows as a placeholder at once and the dialog closes; the
  // mutation resolves only once the live list includes the real deck.
  const createDeck = useMutation({
    mutationFn: (input: { name: string; description: string | null }) =>
      armin.decks.create({ ...input, requestId: createRequestId.current }),
    onMutate: (input) => {
      setClosingAfterCreate(true);
      setOpen(false);
      return { placeholder: requestCreate(input.name, input.description) };
    },
    onSuccess: (_deck, input) => {
      toast({ tone: "success", title: "Deck created", description: input.name });
    },
    onError: (error) => {
      toast({ tone: "error", title: "Couldn’t create deck", description: errorMessage(error) });
    },
    onSettled: (_result, _error, _input, context) => {
      if (context) forgetEdit("create", context.placeholder);
    },
  });

  const create = () => {
    if (!name.trim()) return;
    createDeck.mutate({
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
    });
  };

  const handleCreateDialogExit = () => {
    if (closingAfterCreate) {
      setName("");
      setDescription("");
      setClosingAfterCreate(false);
      createRequestId.current = newRequestId();
    }
  };

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">Decks</h1>
          <p className="mt-1.5 text-sm text-muted">
            {!decksQuery.isLoading
              ? `${decks.length} ${decks.length === 1 ? "deck" : "decks"}, building toward what's next.`
              : "Your study decks live here."}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New deck
        </Button>
      </header>

      {decks.length > 0 && (
        <StudyActivity
          heatmap={heatmapQuery.data?.pending ? undefined : heatmapQuery.data}
          loading={heatmapQuery.isLoading || heatmapQuery.data?.pending === true}
        />
      )}

      {decksQuery.isLoading && <DeckGridSkeleton />}

      {decksQuery.isError && (
        <div className="flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center bg-relearning-bg text-relearning">
            <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-ink">Couldn&apos;t load your decks</h3>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">
            Check your connection and try again. Your saved data is safe.
          </p>
          <Button variant="outline" className="mt-5" onClick={() => void decksQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!decksQuery.isLoading && !decksQuery.isError && decks.length === 0 && (
        <EmptyState
          icon={Layers}
          title="No decks yet"
          description="A deck is a set of flashcards on one subject. Create your first one, then add flashcards and organize their prerequisites."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Create your first deck
              </Button>
              <Link to="/import" className={buttonVariants({ variant: "outline" })}>
                <Upload className="h-4 w-4" /> Import from Anki
              </Link>
            </div>
          }
        />
      )}

      {!decksQuery.isLoading && !decksQuery.isError && decks.length > 0 && (
        <div className="mb-4 flex justify-end">
          <SortControl value={sort} onChange={setSort} options={DECK_SORT_OPTIONS} />
        </div>
      )}

      {!decksQuery.isLoading && !decksQuery.isError && decks.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedDecks.map((deck) => (
            // A deck still being created can't be opened or edited yet.
            <li key={deck.id} inert={deck.pending} className={cn(deck.pending && "opacity-60")}>
              <DeckTile
                deck={deck}
                onPrefetch={() => prefetchDeckPage(queryClient, deck.id)}
                onTogglePin={(pinned) => deckActions.togglePin(deck, pinned)}
                onRename={() => deckActions.rename(deck)}
                onDelete={() => deckActions.remove(deck)}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        onExitComplete={handleCreateDialogExit}
        title="New deck"
        description="Name it for the subject you're learning."
      >
        <div className="space-y-3">
          <Input
            aria-label="Deck name"
            placeholder="e.g. JavaScript Fundamentals"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
          />
          <AutoGrowTextarea
            aria-label="Deck description"
            placeholder="What this deck covers (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minHeight={100}
            maxHeight={240}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim()}
              busy={createDeck.isPending || closingAfterCreate}
              onClick={create}
            >
              Create deck
            </Button>
          </div>
        </div>
      </Dialog>

      {deckActions.dialogs}
    </div>
  );
}

function StudyActivity({
  heatmap,
  loading,
}: {
  heatmap: StatsHeatmap | null | undefined;
  loading: boolean;
}) {
  return (
    <section className="mb-6 border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-ink">Study activity</h2>
          <span className="text-xs text-muted">Last {STATS_COMPACT_HEATMAP_WEEKS} weeks</span>
        </div>
        <Link
          to="/stats"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-accent-deep transition-colors hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          View stats
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex flex-col gap-6 md:flex-row" role="status" aria-busy>
            <span className="sr-only">Loading study activity</span>
            <div className="grid grid-cols-3 gap-4 md:w-40 md:grid-cols-1">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full rounded-none" />
              ))}
            </div>
            <Skeleton className="h-[130px] w-full max-w-[420px] rounded-none" />
          </div>
        ) : heatmap ? (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
            <ActivitySummary heatmap={heatmap} />
            <ReviewHeatmap days={heatmap.days} size="compact" className="flex-1" />
          </div>
        ) : (
          <p className="text-sm text-muted">Activity is unavailable right now.</p>
        )}
      </div>
    </section>
  );
}

function ActivitySummary({ heatmap }: { heatmap: StatsHeatmap }) {
  const today = heatmap.days.at(-1)?.count ?? 0;
  const items = [
    { label: "Today", value: today, unit: today === 1 ? "review" : "reviews" },
    {
      label: "Streak",
      value: heatmap.streak.current,
      unit: heatmap.streak.current === 1 ? "day" : "days",
    },
    { label: "Total", value: heatmap.total, unit: heatmap.total === 1 ? "review" : "reviews" },
  ];
  return (
    <dl className="grid shrink-0 grid-cols-3 gap-4 md:w-36 md:grid-cols-1 md:gap-2 md:border-r md:border-border md:pr-6">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-muted">{item.label}</dt>
          <dd className="mt-0.5 flex items-baseline gap-1.5">
            <span className="font-serif text-xl leading-none font-semibold tabular-nums text-ink">
              {item.value}
            </span>
            <span className="text-xs text-muted">{item.unit}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DeckTile({
  deck,
  onPrefetch,
  onTogglePin,
  onRename,
  onDelete,
}: {
  deck: UiDeck;
  onPrefetch: () => void;
  onTogglePin: (pinned: boolean) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const pinned = useDeckPinnedAt(deck) != null;
  const pct = deck.total > 0 ? Math.round((deck.learned / deck.total) * 100) : 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="group relative flex h-[11.75rem] cursor-pointer flex-col overflow-hidden border border-border bg-surface p-5 transition-colors duration-150 hover:border-border-strong hover:bg-surface-sunken"
        onPointerEnter={onPrefetch}
        onFocus={onPrefetch}
        onPointerDown={onPrefetch}
      >
        <Link
          to="/deck/$deckId"
          params={{ deckId: deck.slug }}
          aria-label={`Open deck: ${deck.name}`}
          className="absolute inset-0 z-10 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="pointer-events-none relative z-20 flex flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            {/* Two lines at most, so every tile is the same size; the full name
                is in a tooltip. The link lets the hoverable title still open
                the deck, while the tile-wide link above stays the one in tab order. */}
            <h2 className="min-w-0 flex-1 font-serif text-lg font-semibold text-ink">
              <Link
                to="/deck/$deckId"
                params={{ deckId: deck.slug }}
                tabIndex={-1}
                aria-hidden
                className="pointer-events-auto block"
              >
                <ClampedLabel label={deck.name} lines={2} />
              </Link>
            </h2>
            <div className="pointer-events-auto relative z-20 shrink-0">
              <DropdownMenu>
                <Tooltip content="Deck actions" className="px-2.5 py-1.5">
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Deck actions"
                        className="-mt-1.5 -mr-1.5"
                      />
                    }
                  >
                    <Ellipsis className="h-4 w-4" />
                  </DropdownMenuTrigger>
                </Tooltip>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DeckActionItems
                    pinned={pinned}
                    onTogglePin={() => onTogglePin(pinned)}
                    onRename={onRename}
                    onDelete={onDelete}
                    Item={DropdownMenuItem}
                    Separator={DropdownMenuSeparator}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="mt-1 flex flex-1 flex-col">
            {deck.description && (
              <p className="line-clamp-1 text-sm text-muted">{deck.description}</p>
            )}
            <div className="mt-4 flex flex-1 flex-col justify-end">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{plural(deck.total, "flashcard")}</span>
                <span>{pct}% learned</span>
              </div>
              <Progress
                value={deck.learned}
                max={deck.total}
                tone="good"
                className="mt-1.5"
                label={`${deck.name} learned`}
              />
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {deck.due > 0 && <Stat color="bg-accent" label={`${deck.due} due`} emphatic />}
                {deck.newCount > 0 && <Stat color="bg-new" label={`${deck.newCount} new`} />}
                {deck.learning > 0 && (
                  <Stat color="bg-learning" label={`${deck.learning} learning`} />
                )}
                {deck.due === 0 && deck.newCount === 0 && (
                  <span className="text-muted">All caught up</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="min-w-40">
        <DeckActionItems
          pinned={pinned}
          onTogglePin={() => onTogglePin(pinned)}
          onRename={onRename}
          onDelete={onDelete}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function Stat({ color, label, emphatic }: { color: string; label: string; emphatic?: boolean }) {
  return (
    <span
      className={
        emphatic
          ? "inline-flex items-center gap-1.5 font-medium text-ink"
          : "inline-flex items-center gap-1.5 text-muted"
      }
    >
      <span className={`h-1.5 w-1.5 ${color}`} aria-hidden />
      {label}
    </span>
  );
}

export const Route = createFileRoute("/_app/")({
  // The signed-out landing page renders from the `_app` frame instead.
  loader: ({ context }) => (context.landing ? undefined : prefetchDecksPage(context.queryClient)),
  head: ({ match }) => (match.context.landing ? {} : { meta: [{ title: "Decks · Armin" }] }),
  component: DecksPage,
});
