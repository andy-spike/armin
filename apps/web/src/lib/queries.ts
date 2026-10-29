import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@armin/backend/api";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { STATS_COMPACT_HEATMAP_WEEKS } from "@armin/core/stats";
import { BROWSE_PAGE_SIZE } from "@armin/core/study";
import type { BrowseQueryFilters } from "@/lib/armin-query";
import { studyClockNow } from "@/lib/study-clock";

/*
 * Query definitions shared by the pages and their route loaders. Each is a
 * live Convex subscription: the server pushes a new result whenever data it
 * read changes, so writes need no cache invalidation. A loader prefetches the
 * exact key its page reads, so data that starts loading on hover is the data
 * the page renders on click.
 *
 * Time-dependent queries take the study clock (`now`), which advances only
 * when something falls due (lib/study-clock.ts).
 */

/**
 * How long an unused subscription stays open after its last reader unmounts,
 * so going back to a page is instant without keeping every page live.
 */
const LIVE_GC_MS = 5 * 60_000;

function live<Query extends FunctionReference<"query">>(query: Query, args: FunctionArgs<Query>) {
  return { ...convexQuery(query, args), gcTime: LIVE_GC_MS };
}

/**
 * For queries that scan the library's review units or history. Any study or
 * deck change reruns every open subscription that read them, and the client
 * sees the change only once all of them have caught up, so unused ones close
 * after a short grace period instead of five minutes.
 */
const HEAVY_GC_MS = 30_000;

function heavy<Query extends FunctionReference<"query">>(query: Query, args: FunctionArgs<Query>) {
  return { ...convexQuery(query, args), gcTime: HEAVY_GC_MS };
}

/** Drop unset filters: Convex arguments can't carry `undefined`. */
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

/** One Browse page: the first (`cursor: null`), or the one after a cursor. */
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

/** Library due count and the moment time next changes it; drives the study clock. */
export const reviewStatusQuery = (now = studyClockNow()) =>
  queryOptions(live(api.review.status, { now }));

/** All Stats page sections for the library or one deck. */
export const statsOverviewQuery = (deckId?: string, now = studyClockNow()) =>
  queryOptions({ ...heavy(api.stats.overview, defined({ deckId, now })) });

/** Compact heatmap and streak for the Decks page. */
export const statsHeatmapQuery = (weeks = STATS_COMPACT_HEATMAP_WEEKS, now = studyClockNow()) =>
  queryOptions({ ...heavy(api.stats.heatmap, { weeks, now }) });

/** The review queue for one deck, or for every deck. */
export const reviewQueueQuery = (deckId?: string, now = studyClockNow()) =>
  queryOptions(heavy(api.review.queue, defined({ deckId, now })));

/** The filters a cram setup sends to the count and queue queries. */
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

/** Live match count for the cram setup dialog. */
export const cramCountQuery = (deckId: string, filters: CramFilters) =>
  queryOptions({
    ...heavy(api.cram.count, cramArgs(deckId, filters)),
    select: (result) => result?.count ?? 0,
  });

/** Every unit matching a cram setup; the session shuffles and limits locally. */
export const cramQueueQuery = (deckId: string, filters: CramFilters) =>
  queryOptions(heavy(api.cram.queue, cramArgs(deckId, filters)));

/** A flashcard's schedule and review history, for the card info dialog. `null` skips. */
export const cardInfoQuery = (flashcardId: string | null) =>
  queryOptions({
    ...(flashcardId
      ? live(api.review.cardInfo, { flashcardId })
      : convexQuery(api.review.cardInfo, "skip")),
    select: (info) => info ?? null,
  });

/** How many links a move would remove, for the move dialog. `null` skips. */
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

/** The default sort each page opens with; prefetching any other sort would miss. */
export const DECK_PAGE_SORT = "due-soon";
export const BROWSE_PAGE_SORT = "created-new";

/*
 * Page prefetchers. Route loaders call these when the router preloads on
 * intent (hover or focus of a link) and again on navigation, without waiting,
 * so the click usually finds the data already cached. A prefetched query
 * stays subscribed, so it is still current when the page opens. They only run
 * in the browser: these reads go over the signed-in Convex socket, which
 * server renders don't open.
 */

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

/** Cram's queue depends on the setup search, so only the deck is prefetched. */
export function prefetchCramPage(queryClient: QueryClient, deckId: string) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(deckQuery(deckId));
}

export function prefetchSettingsPage(queryClient: QueryClient) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(settingsQuery());
}
