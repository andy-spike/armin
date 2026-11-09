import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@armin/backend/api";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { STATS_COMPACT_HEATMAP_WEEKS } from "@armin/core/stats";
import { BROWSE_PAGE_SIZE } from "@armin/core/study";
import type { BrowseQueryFilters } from "@/lib/armin-query";
import { studyClockNow } from "@/lib/study-clock";

const LIVE_GC_MS = 5 * 60_000;

function live<Query extends FunctionReference<"query">>(query: Query, args: FunctionArgs<Query>) {
  return { ...convexQuery(query, args), gcTime: LIVE_GC_MS };
}

const HEAVY_GC_MS = 30_000;

function heavy<Query extends FunctionReference<"query">>(query: Query, args: FunctionArgs<Query>) {
  return { ...convexQuery(query, args), gcTime: HEAVY_GC_MS };
}

function defined<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export const decksQuery = (now = studyClockNow()) =>
  queryOptions({ ...heavy(api.decks.list, { now }), select: (decks) => decks ?? [] });

export const deckNamesQuery = () =>
  queryOptions({ ...live(api.decks.listNames, {}), select: (decks) => decks ?? [] });

export const deckQuery = (deckId: string, now = studyClockNow()) =>
  queryOptions({ ...heavy(api.decks.get, { deckId, now }), select: (deck) => deck ?? null });

export const tagsQuery = () =>
  queryOptions({ ...live(api.flashcards.listTags, {}), select: (tags) => tags ?? [] });

export const deckTagsQuery = (deckId: string) =>
  queryOptions({
    ...live(api.flashcards.listDeckTags, { deckId }),
    select: (tags) => tags ?? [],
  });

export type BrowsePageSpec = { cursor: string | null; endCursor?: string };

export const browsePageQuery = (filters: BrowseQueryFilters, page: BrowsePageSpec) =>
  queryOptions(
    heavy(api.flashcards.browsePage, {
      ...defined(filters),
      paginationOpts: defined({
        numItems: BROWSE_PAGE_SIZE,
        cursor: page.cursor,
        endCursor: page.endCursor,
      }),
    }),
  );

export const browseCountsQuery = ({ sort: _sort, ...filters }: BrowseQueryFilters) =>
  queryOptions(heavy(api.flashcards.browseCounts, defined(filters)));

export const reviewStatusQuery = (now = studyClockNow()) =>
  queryOptions(live(api.review.status, { now }));

export const statsOverviewQuery = (deckId?: string, now = studyClockNow()) =>
  queryOptions({ ...heavy(api.stats.overview, defined({ deckId, now })) });

export const statsHeatmapQuery = (weeks = STATS_COMPACT_HEATMAP_WEEKS, now = studyClockNow()) =>
  queryOptions({ ...heavy(api.stats.heatmap, { weeks, now }) });

export const reviewQueueQuery = (deckId?: string, now = studyClockNow()) =>
  queryOptions(heavy(api.review.queue, defined({ deckId, now, metadataOnly: true })));

export type CramFilters = {
  states: number[];
  tag?: string;
  forgottenWithinDays?: number;
  includeLocked: boolean;
};

const cramArgs = (deckId: string, filters: CramFilters) =>
  defined({
    deckId,
    states: filters.states,
    tag: filters.tag,
    forgottenWithinDays: filters.forgottenWithinDays,
    includeLocked: filters.includeLocked,
  });

export const cramCountQuery = (deckId: string, filters: CramFilters) =>
  queryOptions({
    ...heavy(api.cram.count, cramArgs(deckId, filters)),
    select: (result) => result?.count ?? 0,
  });

export const cramQueueQuery = (deckId: string, filters: CramFilters, max?: number, seed = 1) =>
  queryOptions(
    heavy(api.cram.queue, defined({ ...cramArgs(deckId, filters), max, seed, metadataOnly: true })),
  );

export const cardInfoQuery = (flashcardId: string | null) =>
  queryOptions({
    ...(flashcardId
      ? live(api.review.cardInfo, { flashcardId })
      : convexQuery(api.review.cardInfo, "skip")),
    select: (info) => info ?? null,
  });

export const conceptPoolQuery = (flashcardId: string | null) =>
  queryOptions({
    ...(flashcardId
      ? live(api.concepts.pool, { flashcardId })
      : convexQuery(api.concepts.pool, "skip")),
    select: (pool) => pool ?? null,
  });

export const conceptAvailabilityQuery = () => queryOptions(live(api.concepts.availability, {}));

export const moveConsequencesQuery = (flashcardId: string | null) =>
  queryOptions({
    ...(flashcardId
      ? live(api.flashcards.moveConsequences, {
          flashcardId: flashcardId as FunctionArgs<
            typeof api.flashcards.moveConsequences
          >["flashcardId"],
        })
      : convexQuery(api.flashcards.moveConsequences, "skip")),
    select: (result) => {
      if (!result) throw new Error("Flashcard not found.");
      return result;
    },
  });

export const graphQuery = (deckId: string) =>
  queryOptions({
    ...heavy(api.graph.getDeck, { deckId }),
    select: (graph) => graph ?? { version: 0, nodes: [], edges: [] },
  });

export const settingsQuery = () =>
  queryOptions({
    ...live(api.settings.get, {}),
    select: (settings) => {
      if (!settings) throw new Error("Settings are not available.");
      return settings;
    },
  });

export const DECK_PAGE_SORT = "due-soon";
export const BROWSE_PAGE_SORT = "created-new";

const inBrowser = () => typeof window !== "undefined";

function prefetchBrowse(queryClient: QueryClient, filters: BrowseQueryFilters) {
  void queryClient.prefetchQuery(browsePageQuery(filters, { cursor: null }));
  void queryClient.prefetchQuery(browseCountsQuery(filters));
}

export function prefetchDecksPage(queryClient: QueryClient) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(decksQuery());
  void queryClient.prefetchQuery(statsHeatmapQuery());
}

export function prefetchStatsPage(queryClient: QueryClient) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(deckNamesQuery());
  void queryClient.prefetchQuery(statsOverviewQuery());
}

export function prefetchDeckPage(queryClient: QueryClient, deckId: string) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(deckQuery(deckId));
  void queryClient.prefetchQuery(deckTagsQuery(deckId));
  prefetchBrowse(queryClient, { sort: DECK_PAGE_SORT, deckId });
}

export function prefetchGraphPage(queryClient: QueryClient, deckId: string) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(deckQuery(deckId));
  void queryClient.prefetchQuery(graphQuery(deckId));
}

export function prefetchBrowsePage(queryClient: QueryClient) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(deckNamesQuery());
  void queryClient.prefetchQuery(tagsQuery());
  prefetchBrowse(queryClient, { sort: BROWSE_PAGE_SORT });
}

export function prefetchReviewPage(queryClient: QueryClient, deckId?: string) {
  if (!inBrowser()) return;
  if (deckId) void queryClient.prefetchQuery(deckQuery(deckId));
  else void queryClient.prefetchQuery(deckNamesQuery());
  void queryClient.prefetchQuery(reviewQueueQuery(deckId));
}

export function prefetchCramPage(queryClient: QueryClient, deckId: string) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(deckQuery(deckId));
}

export function prefetchSettingsPage(queryClient: QueryClient) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(settingsQuery());
}
