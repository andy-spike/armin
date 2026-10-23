import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  BROWSE_PAGE_SORT,
  browseQuery as browseQueryOptions,
  decksQuery as decksQueryOptions,
  prefetchBrowsePage,
  tagsQuery as tagsQueryOptions,
} from "@/lib/queries";
import { armin } from "@/lib/armin-client";
import { notifySaveError } from "@/lib/notify";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Tag, Layers, AlertTriangle, Library, CircleDot, Search } from "lucide-react";
import { FlashcardFormDialog } from "@/components/flashcard-form-dialog-lazy";
import {
  FlashcardDeleteDialog,
  FlashcardTile,
  type FlashcardDeleteRequest,
} from "@/components/flashcard-tile";
import { MoveFlashcardDialog } from "@/components/move-flashcard-dialog";
import { SortControl } from "@/components/sort-control";
import { Input } from "@/components/ui/input";
import {
  SearchableMultiSelect,
  SearchableSelect,
} from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BrowseContentSkeleton } from "@/components/page-skeletons";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import {
  flashcardKeys,
  invalidateCoreData,
  type BrowseQueryFilters,
} from "@/lib/armin-query";
import {
  toUiBrowseFlashcard,
  type UiBrowseFlashcard,
} from "@/types/view-models";
import {
  BROWSE_SORT_OPTIONS,
  buildDeckFilterOptions,
  formatCardCounts,
  type BrowseSortKey,
} from "@/lib/browse";
import { STATE_OPTIONS } from "@/lib/flashcard-filters";
import { cn } from "@/lib/utils";
import type { FlashcardDeleteConsequences } from "@/types/window";

const ALL_STATES = "all";
const SEARCH_DEBOUNCE_MS = 250;

function BrowsePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const [sort, setSort] = useState<BrowseSortKey>(BROWSE_PAGE_SORT);
  const [stateFilter, setStateFilter] = useState<string>(ALL_STATES);
  const [deckFilter, setDeckFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UiBrowseFlashcard | null>(null);
  const [moveTarget, setMoveTarget] = useState<UiBrowseFlashcard | null>(null);
  const [deleteRequest, setDeleteRequest] =
    useState<FlashcardDeleteRequest | null>(null);
  const [deleteConsequences, setDeleteConsequences] =
    useState<FlashcardDeleteConsequences | null>(null);
  const [deleteConsequencesError, setDeleteConsequencesError] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const browseFilters = useMemo(() => {
    const filters: BrowseQueryFilters = { sort };
    if (stateFilter !== ALL_STATES) {
      const state = Number(stateFilter);
      if (Number.isInteger(state)) filters.state = state;
    }
    if (deckFilter) filters.deckId = deckFilter;
    if (tagFilter.length > 0) filters.tags = tagFilter;
    if (search) filters.search = search;
    return filters;
  }, [sort, stateFilter, deckFilter, tagFilter, search]);

  const decksQuery = useQuery(decksQueryOptions());
  const tagsQuery = useQuery(tagsQueryOptions());

  const browseQuery = useInfiniteQuery({
    ...browseQueryOptions(browseFilters),
    placeholderData: keepPreviousData,
  });

  const displayed = useMemo(
    () =>
      (browseQuery.data?.pages ?? [])
        .flatMap((page) => page.flashcards)
        .map(toUiBrowseFlashcard),
    [browseQuery.data],
  );

  const filteredTotal = browseQuery.data?.pages[0]?.filteredTotal ?? 0;
  const filteredArchived = browseQuery.data?.pages[0]?.filteredArchived ?? 0;
  const libraryTotal = browseQuery.data?.pages[0]?.libraryTotal ?? 0;
  const libraryArchived = browseQuery.data?.pages[0]?.libraryArchived ?? 0;
  const filteredActive = Math.max(0, filteredTotal - filteredArchived);
  const libraryActive = Math.max(0, libraryTotal - libraryArchived);
  const countSummary =
    filteredTotal === libraryTotal
      ? formatCardCounts(filteredActive, filteredArchived)
      : `${formatCardCounts(filteredActive, filteredArchived)} of ${formatCardCounts(libraryActive, libraryArchived)}`;
  const hasMore = browseQuery.hasNextPage ?? false;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = browseQuery;

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore || isFetchingNextPage) return;

    const root = sentinel.closest(".route-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage
        ) {
          void fetchNextPage();
        }
      },
      { root, rootMargin: "240px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    hasMore,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    browseFilters,
  ]);

  const openEdit = (card: UiBrowseFlashcard) => {
    setEditing(card);
    setOpen(true);
  };

  const closeDialog = () => setOpen(false);

  const handleDialogExitComplete = () => {
    setEditing(null);
  };

  const requestDelete = (request: FlashcardDeleteRequest) => {
    setDeleteRequest(request);
    setDeleteConsequences(null);
    setDeleteConsequencesError(false);
    if (request.loadDeleteConsequences) {
      void request
        .loadDeleteConsequences(request.card.id)
        .then((summary) => setDeleteConsequences(summary))
        .catch(() => setDeleteConsequencesError(true));
    }
  };

  const closeDeleteDialog = () => {
    setDeleteRequest(null);
    setDeleteConsequences(null);
    setDeleteConsequencesError(false);
  };

  const updateCard = useMutation({
    mutationFn: (values: CardFormValues & { id: string; version: number }) =>
      armin.flashcards.update(values),
    onSuccess: (_card, values) => {
      invalidateCoreData(queryClient, editing?.deckId);
      if (values.id)
        void queryClient.invalidateQueries({ queryKey: flashcardKeys.all });
      toast({ tone: "success", title: "Flashcard updated" });
      closeDialog();
    },
    onError: (error) => notifySaveError(toast, "Couldn’t update flashcard", error),
  });

  const deleteCard = useMutation({
    mutationFn: (card: UiBrowseFlashcard) =>
      armin.flashcards.delete(card.id).then(() => card),
    onSuccess: (card) => {
      invalidateCoreData(queryClient, card.deckId);
      toast({ tone: "error", title: "Flashcard deleted" });
    },
    onError: () => toast({ tone: "error", title: "Couldn’t delete flashcard" }),
  });

  const archiveCard = useMutation({
    mutationFn: ({
      card,
      archived,
    }: {
      card: UiBrowseFlashcard;
      archived: boolean;
    }) => armin.flashcards.archive(card.id, archived).then(() => card),
    onSuccess: (card, { archived }) => {
      invalidateCoreData(queryClient, card.deckId);
      toast({
        tone: "success",
        title: archived ? "Flashcard archived" : "Flashcard unarchived",
      });
    },
    onError: () =>
      toast({ tone: "error", title: "Could not update flashcard" }),
  });

  const saveCard = (values: CardFormValues) => {
    if (!editing) return;
    updateCard.mutate({ id: editing.id, version: editing.version, ...values });
  };

  const allTags = tagsQuery.data ?? [];

  const deckOptions = useMemo(
    () => buildDeckFilterOptions(decksQuery.data ?? []),
    [decksQuery.data],
  );

  const tagOptions = useMemo(
    () => (tagsQuery.data ?? []).map((tag) => ({ value: tag, label: tag })),
    [tagsQuery.data],
  );

  const stateItems = useMemo(
    () => [
      { value: ALL_STATES, label: "All states" },
      ...STATE_OPTIONS.map((option) => ({
        value: String(option.value),
        label: option.label,
      })),
    ],
    [],
  );

  const isInitialLoading =
    browseQuery.isLoading || decksQuery.isLoading || tagsQuery.isLoading;
  const hasLibrary = !isInitialLoading && libraryTotal > 0;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
          Browse
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Every flashcard across your decks. Search, filter, and sort to find
          anything.
        </p>
      </header>

      {isInitialLoading && <BrowseContentSkeleton />}

      {browseQuery.isError && (
        <div className="flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center bg-relearning-bg text-relearning">
            <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-ink">
            Couldn&apos;t load your flashcards
          </h3>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">
            Check your connection and try again. Your saved data is safe.
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => void browseQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      )}

      {!isInitialLoading && !browseQuery.isError && libraryTotal === 0 && (
        <EmptyState
          icon={Library}
          title="No flashcards yet"
          description="Create a deck and add flashcards. They’ll all show up here."
          action={
            <Link to="/">
              <Button variant="outline">Go to decks</Button>
            </Link>
          }
        />
      )}

      {hasLibrary && (
        <>
          <div className="mb-5 border border-border bg-bg-2 px-4 py-3">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-4">
                <FilterField
                  className="w-full sm:w-64"
                  label={
                    <>
                      <Search className="h-3.5 w-3.5" aria-hidden /> Search
                    </>
                  }
                >
                  <Input
                    type="search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Front, back, or answer…"
                    aria-label="Search flashcards"
                    autoComplete="off"
                  />
                </FilterField>

                <FilterField
                  className="w-36"
                  label={
                    <>
                      <CircleDot className="h-3.5 w-3.5" aria-hidden /> State
                    </>
                  }
                >
                  <Select
                    value={stateFilter}
                    items={stateItems}
                    onValueChange={(value) =>
                      setStateFilter(value ?? ALL_STATES)
                    }
                  >
                    <SelectTrigger
                      className="w-full border-border-strong bg-surface"
                      aria-label="Filter by state"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value={ALL_STATES}>All states</SelectItem>
                        {STATE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField
                  className="w-52"
                  label={
                    <>
                      <Layers className="h-3.5 w-3.5" aria-hidden /> Deck
                    </>
                  }
                >
                  <SearchableSelect
                    value={deckFilter}
                    onValueChange={setDeckFilter}
                    options={deckOptions}
                    placeholder="All decks"
                    searchPlaceholder="Search decks…"
                    emptyText="No decks found."
                    aria-label="Filter by deck"
                  />
                </FilterField>

                {allTags.length > 0 ? (
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
                    <p className="flex h-9 items-center text-sm text-muted">
                      No tags
                    </p>
                  </FilterField>
                )}
              </div>
              <SortControl
                fieldLayout
                value={sort}
                onChange={setSort}
                options={BROWSE_SORT_OPTIONS}
                triggerClassName="min-w-[11rem]"
              />
            </div>
          </div>

          <p className="mb-3 text-xs text-muted">
            {hasMore
              ? `Showing ${displayed.length} of ${filteredTotal} matching cards · ${countSummary}`
              : countSummary}
          </p>

          {filteredTotal > 0 ? (
            <>
              <ul className="card-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {displayed.map((card) => (
                  <FlashcardTile
                    key={`${card.deckId}-${card.id}`}
                    card={card}
                    deckName={card.deckName}
                    onOpen={() => openEdit(card)}
                    onGoToDeck={() =>
                      navigate({
                        to: "/deck/$deckId",
                        params: { deckId: card.deckId },
                      })
                    }
                    onMove={() => setMoveTarget(card)}
                    onArchiveToggle={() =>
                      void archiveCard.mutateAsync({
                        card,
                        archived: !card.archived,
                      })
                    }
                    loadDeleteConsequences={(id) =>
                      armin.flashcards.deleteConsequences(id)
                    }
                    onDeleteRequest={requestDelete}
                    onDelete={async () => {
                      await deleteCard.mutateAsync(card);
                    }}
                  />
                ))}
              </ul>
              {hasMore || browseQuery.isFetchingNextPage ? (
                <div
                  ref={loadMoreRef}
                  className="mt-4 flex justify-center py-2"
                  aria-hidden
                >
                  {browseQuery.isFetchingNextPage ? (
                    <Skeleton className="h-4 w-28" />
                  ) : (
                    <div className="h-px w-full" />
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <div className="border border-border bg-bg-2 px-6 py-10 text-center">
              <p className="text-sm text-muted">
                {search
                  ? `No flashcards match “${search}”.`
                  : "No flashcards match the current filters."}
              </p>
              {search && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setSearchInput("")}
                >
                  Clear search
                </Button>
              )}
            </div>
          )}
        </>
      )}

      <FlashcardFormDialog
        open={open}
        onClose={closeDialog}
        onExitComplete={handleDialogExitComplete}
        mode="edit"
        reviewUnitId={editing?.id ?? null}
        initialType={editing?.type ?? "basic"}
        initialContent={editing?.content ?? null}
        initialTags={editing?.tags ?? []}
        onSubmit={saveCard}
      />
      <MoveFlashcardDialog
        flashcard={moveTarget}
        open={Boolean(moveTarget)}
        onClose={() => setMoveTarget(null)}
      />
      <FlashcardDeleteDialog
        request={deleteRequest}
        consequences={deleteConsequences}
        consequencesError={deleteConsequencesError}
        onClose={closeDeleteDialog}
        onArchiveInstead={() => {
          const request = deleteRequest;
          closeDeleteDialog();
          void request?.archiveInstead();
        }}
        onConfirm={() => {
          const request = deleteRequest;
          closeDeleteDialog();
          request?.confirmDelete();
        }}
      />
    </div>
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

export const Route = createFileRoute("/_app/browse")({
  loader: ({ context }) => prefetchBrowsePage(context.queryClient),
  head: () => ({ meta: [{ title: "Browse · Armin" }] }),
  component: BrowsePage,
});
