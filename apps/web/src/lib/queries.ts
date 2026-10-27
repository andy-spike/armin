import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@armin/backend/api";
import type { FunctionArgs, FunctionReference } from "convex/server";
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

/** Drop unset filters: Convex arguments can't carry `undefined`. */
function defined<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export const decksQuery = (now = studyClockNow()) =>
  queryOptions({ ...live(api.decks.list, { now }), select: (decks) => decks ?? [] });

export const deckNamesQuery = () =>
  queryOptions({ ...live(api.decks.listNames, {}), select: (decks) => decks ?? [] });

export const deckQuery = (deckId: string, now = studyClockNow()) =>
  queryOptions({ ...live(api.decks.get, { deckId, now }), select: (deck) => deck ?? null });

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
    live(api.flashcards.browsePage, {
      ...defined(filters),
      paginationOpts: defined({
        numItems: BROWSE_PAGE_SIZE,
        cursor: page.cursor,
        endCursor: page.endCursor,
      }),
    }),
  );

export const browseCountsQuery = ({ sort: _sort, ...filters }: BrowseQueryFilters) =>
  queryOptions(live(api.flashcards.browseCounts, defined(filters)));

/** Library due count and the moment time next changes it; drives the study clock. */
export const reviewStatusQuery = (now = studyClockNow()) =>
  queryOptions(live(api.review.status, { now }));

/** The review queue for one deck, or for every deck. */
export const reviewQueueQuery = (deckId?: string, now = studyClockNow()) =>
  queryOptions(live(api.review.queue, defined({ deckId, now })));

/** Interval labels for a unit's rating buttons. */
export const reviewPreviewQuery = (reviewUnitId: string, now = studyClockNow()) =>
  queryOptions(
    live(api.review.preview, {
      reviewUnitId: reviewUnitId as FunctionArgs<typeof api.review.preview>["reviewUnitId"],
      now,
    }),
  );

export const graphQuery = (deckId: string) =>
  queryOptions({
    ...live(api.graph.getDeck, { deckId }),
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

export const deckSettingsQuery = (deckId: string) =>
  queryOptions({
    ...live(api.settings.getDeck, {
      deckId: deckId as FunctionArgs<typeof api.settings.getDeck>["deckId"],
    }),
    select: (settings) => {
      if (!settings) throw new Error("Deck settings are not available.");
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

export function prefetchSettingsPage(queryClient: QueryClient) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(settingsQuery());
}
