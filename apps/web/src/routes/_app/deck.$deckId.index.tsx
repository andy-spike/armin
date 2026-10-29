import { createFileRoute, Link } from "@tanstack/react-router";
import {
  DECK_PAGE_SORT,
  deckQuery as deckQueryOptions,
  deckTagsQuery,
  prefetchDeckPage,
} from "@/lib/queries";
import { armin } from "@/lib/armin-client";
import { notifySaveError } from "@/lib/notify";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Play,
  Layers,
  AlertTriangle,
  Share2,
  Tag,
  Settings,
  Brain,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CramDialog } from "@/components/cram-dialog";
import { FlashcardFormDialog } from "@/components/flashcard-form-dialog-lazy";
import { DeckSettingsDialog } from "@/components/deck-settings-dialog";
import { FlashcardTile } from "@/components/flashcard-tile";
import { VirtualFlashcardGrid } from "@/components/virtual-flashcard-grid";
import { SortControl } from "@/components/sort-control";
import { SearchableMultiSelect } from "@/components/ui/combobox";
import { FLASHCARD_SORT_OPTIONS, type FlashcardSortKey } from "@/lib/sort-flashcards";
import { formatCardCounts } from "@/lib/browse";
import { cn } from "@/lib/utils";
import {
  DeckCardsSkeleton,
  DeckHeaderSkeleton,
  FlashcardGridSkeleton,
} from "@/components/page-skeletons";
import { EmptyState } from "@/components/ui/empty-state";
import { useFlashcardTileActions } from "@/components/use-flashcard-tile-actions";
import { useToast } from "@/components/ui/toast";
import type { BrowseQueryFilters } from "@/lib/armin-query";
import { useStudyClock } from "@/lib/study-clock";
import { useBrowse } from "@/lib/use-browse";
import { getCachedDeckDetail, getCachedDeckDetailUpdatedAt } from "@/lib/deck-detail-cache";
import { toUiFlashcard, type UiDeck, type UiFlashcard } from "@/types/view-models";
import type { CardFormValues } from "@/components/flashcard-form-dialog";

function DeckPage() {
  const { deckId } = Route.useParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cramOpen, setCramOpen] = useState(false);
  const [editing, setEditing] = useState<UiFlashcard | null>(null);
  const [sort, setSort] = useState<FlashcardSortKey>(DECK_PAGE_SORT);
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  const browseFilters = useMemo(() => {
    const filters: BrowseQueryFilters = { sort, deckId };
    if (tagFilter.length > 0) filters.tags = tagFilter;
    return filters;
  }, [sort, deckId, tagFilter]);

  const deckQuery = useQuery({
    ...deckQueryOptions(deckId, useStudyClock()),
    initialData: () => getCachedDeckDetail(queryClient, deckId),
    initialDataUpdatedAt: () => getCachedDeckDetailUpdatedAt(queryClient, deckId),
  });

  const tagsQuery = useQuery(deckTagsQuery(deckId));

  const cardsQuery = useBrowse(browseFilters);

  const displayed = useMemo(
    () => cardsQuery.flashcards.map(toUiFlashcard),
    [cardsQuery.flashcards],
  );

  // Rendering a page of flashcard tiles is the heavy part of opening a deck —
  // each tile mounts two Base UI menu trees, so 30 of them block the main
  // thread for a few hundred ms while the (sub-20ms) data is long since loaded.
  // Deferring the rendered list keeps the route's first paint cheap: the
  // skeleton shows instantly and the tiles stream in through a non-blocking
  // concurrent render instead of freezing the navigation.
  const deferredDisplayed = useDeferredValue(displayed);
  const cardsRendering = deferredDisplayed !== displayed;

  const { filteredTotal, filteredArchived } = cardsQuery;
  const filteredActive = Math.max(0, filteredTotal - filteredArchived);
  const hasMore = cardsQuery.hasNextPage;

  const deckTags = tagsQuery.data ?? [];
  const tagOptions = useMemo(
    () => (tagsQuery.data ?? []).map((t) => ({ value: t, label: t })),
    [tagsQuery.data],
  );

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (card: UiFlashcard) => {
    setEditing(card);
    setOpen(true);
  };

  const closeDialog = () => setOpen(false);

  const handleDialogExitComplete = () => {
    setEditing(null);
  };

  const tileActions = useFlashcardTileActions();

  const createCard = useMutation({
    mutationFn: (values: CardFormValues) => armin.flashcards.create({ deckId, ...values }),
    onSuccess: () => {
      toast({ tone: "success", title: "Flashcard added" });
    },
    onError: () => toast({ tone: "error", title: "Couldn’t add flashcard" }),
  });

  const updateCard = useMutation({
    mutationFn: (values: CardFormValues & { id: string; version: number }) =>
      armin.flashcards.update(values),
    onSuccess: () => {
      toast({ tone: "success", title: "Flashcard updated" });
      closeDialog();
    },
    onError: (error) => notifySaveError(toast, "Couldn’t update flashcard", error),
  });

  const saveCard = async (values: CardFormValues) => {
    if (editing) {
      await updateCard.mutateAsync({ id: editing.id, version: editing.version, ...values });
    } else await createCard.mutateAsync(values);
  };

  const deck = deckQuery.data;
  const dueCount = deck?.due ?? 0;
  const cardsLoading = cardsQuery.isLoading;
  // Skeleton covers both the fetch and the deferred tile render that follows it,
  // but only when nothing is on screen yet. Once tiles are rendered, a later
  // data change re-renders them concurrently without flashing back to skeleton.
  const showCardsSkeleton = (cardsLoading || cardsRendering) && deferredDisplayed.length === 0;
  const isError = deckQuery.isError || cardsQuery.isError;

  if (isError) {
    return (
      <div>
        <BackLink />
        <div className="mt-6">
          <div className="flex flex-col items-center rounded-xl border border-border bg-bg-2 px-6 py-14 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-relearning-bg text-relearning">
              <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <h3 className="text-base font-semibold text-ink">
              Couldn&apos;t load these flashcards
            </h3>
            <p className="mt-1 max-w-[40ch] text-sm text-muted">
              Check your connection and try again. Your saved data is safe.
            </p>
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => {
                void deckQuery.refetch();
                cardsQuery.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (deckQuery.isSuccess && !deck) {
    return (
      <div>
        <BackLink />
        <EmptyState
          className="mt-8"
          icon={Layers}
          title="Deck not found"
          description="This deck doesn't exist in your library. It may have been removed or the link is stale."
          action={
            <Link to="/">
              <Button variant="outline">Back to decks</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <BackLink />

      {deck ? (
        <DeckHeader
          deck={deck}
          dueCount={dueCount}
          onSettings={() => setSettingsOpen(true)}
          onCram={() => setCramOpen(true)}
          onAddCard={openNew}
        />
      ) : (
        <DeckHeaderSkeleton />
      )}

      {!deck && <DeckCardsSkeleton />}

      {deck?.total === 0 && deck.archived === 0 && !cardsLoading && (
        <EmptyState
          icon={Layers}
          title="No flashcards in this deck"
          description="Add a flashcard by hand, then connect prerequisites in the graph as the deck grows."
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Add your first card
            </Button>
          }
        />
      )}

      {deck && deck.total + deck.archived > 0 && (
        <>
          <div className="mb-5 border border-border bg-bg-2 px-4 py-3">
            <div className="flex flex-wrap items-end justify-between gap-4">
              {deckTags.length > 0 ? (
                <FilterField
                  className="w-44"
                  label={
                    <>
                      <Tag className="h-3.5 w-3.5" aria-hidden /> Tag
                    </>
                  }
                >
                  <SearchableMultiSelect
                    value={tagFilter}
                    onValueChange={setTagFilter}
                    options={tagOptions}
                    placeholder="All tags"
                    searchPlaceholder="Search tags…"
                    emptyText="No tags found."
                    aria-label="Filter by tag"
                  />
                </FilterField>
              ) : (
                <FilterField
                  className="w-44"
                  label={
                    <>
                      <Tag className="h-3.5 w-3.5" aria-hidden /> Tag
                    </>
                  }
                >
                  <p className="flex h-9 items-center text-sm text-muted">No tags</p>
                </FilterField>
              )}
              <SortControl
                fieldLayout
                value={sort}
                onChange={setSort}
                options={FLASHCARD_SORT_OPTIONS}
                triggerClassName="min-w-[11rem]"
              />
            </div>
          </div>

          {showCardsSkeleton && <FlashcardGridSkeleton />}

          {!showCardsSkeleton && filteredTotal > 0 && (
            <>
              <p className="mb-3 text-xs text-muted">
                {hasMore
                  ? `Showing ${deferredDisplayed.length} of ${filteredTotal} matching cards · ${formatCardCounts(filteredActive, filteredArchived)}`
                  : formatCardCounts(filteredActive, filteredArchived)}
              </p>
              <VirtualFlashcardGrid
                cards={deferredDisplayed}
                hasMore={hasMore}
                isFetchingNextPage={cardsQuery.isFetchingNextPage}
                fetchNextPage={cardsQuery.fetchNextPage}
                renderCard={(card) => (
                  <FlashcardTile
                    key={card.id}
                    card={card}
                    onOpen={() => openEdit(card)}
                    {...tileActions.tileProps(card)}
                  />
                )}
              />
            </>
          )}

          {!showCardsSkeleton && filteredTotal === 0 && (
            <p className="border border-border bg-bg-2 px-6 py-10 text-center text-sm text-muted">
              No flashcards match the selected tags.
            </p>
          )}
        </>
      )}

      <FlashcardFormDialog
        open={open}
        onClose={closeDialog}
        onExitComplete={handleDialogExitComplete}
        mode={editing ? "edit" : "create"}
        reviewUnitId={editing?.id ?? null}
        initialType={editing?.type ?? "basic"}
        initialContent={editing?.content ?? null}
        initialTags={editing?.tags ?? []}
        onSubmit={saveCard}
      />
      {deck && (
        <DeckSettingsDialog
          deckId={deck.id}
          deckName={deck.name}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {deck && (
        <CramDialog
          deckId={deck.id}
          tags={deckTags}
          open={cramOpen}
          onClose={() => setCramOpen(false)}
        />
      )}
      {tileActions.dialogs}
    </div>
  );
}

function DeckHeader({
  deck,
  dueCount,
  onSettings,
  onCram,
  onAddCard,
}: {
  deck: UiDeck;
  dueCount: number;
  onSettings: () => void;
  onCram: () => void;
  onAddCard: () => void;
}) {
  return (
    <header className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">{deck.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {formatCardCounts(deck.total, deck.archived)}
          <span className="text-border-strong"> · </span>
          {deck.learned} learned
          {dueCount > 0 && (
            <>
              <span className="text-border-strong"> · </span>
              <span className="font-medium text-accent">{dueCount} due now</span>
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Review is the one filled action while cards are due. */}
        <Button variant={dueCount > 0 ? "outline" : "primary"} onClick={onAddCard}>
          <Plus className="h-4 w-4" /> Add card
        </Button>
        <Button variant="outline" onClick={onSettings}>
          <Settings className="h-4 w-4" /> Settings
        </Button>
        <Link
          to="/deck/$deckId/graph"
          params={{ deckId: deck.id }}
          className={buttonVariants({ variant: "outline" })}
        >
          <Share2 className="h-4 w-4" /> Graph
        </Link>
        <Button variant="outline" onClick={onCram}>
          <Brain className="h-4 w-4" /> Cram
        </Button>
        {dueCount > 0 && (
          <Link to="/deck/$deckId/review" params={{ deckId: deck.id }} className={buttonVariants()}>
            <Play className="h-4 w-4" /> Review
          </Link>
        )}
      </div>
    </header>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <ArrowLeft className="h-4 w-4" /> All decks
    </Link>
  );
}

function FilterField({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="inline-flex h-3.5 items-center gap-1.5 text-xs font-medium text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export const Route = createFileRoute("/_app/deck/$deckId/")({
  loader: ({ context, params }) => prefetchDeckPage(context.queryClient, params.deckId),
  head: () => ({ meta: [{ title: "Deck · Armin" }] }),
  component: DeckPage,
});
