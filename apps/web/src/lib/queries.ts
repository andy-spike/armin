import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { BROWSE_PAGE_SIZE } from "@armin/core/study";
import { armin } from "@/lib/armin-client";
import {
  deckKeys,
  flashcardKeys,
  graphKeys,
  reviewKeys,
  settingsKeys,
  type BrowseQueryFilters,
} from "@/lib/armin-query";

/*
 * Query definitions shared by the pages and their route loaders. A loader
 * prefetches with the exact key and fetcher its page reads, so data that
 * starts loading on hover is the data the page renders on click.
 */

export const decksQuery = () =>
  queryOptions({ queryKey: deckKeys.all, queryFn: () => armin.decks.list() });

export const deckQuery = (deckId: string) =>
  queryOptions({
    queryKey: deckKeys.detail(deckId),
    queryFn: () => armin.decks.get(deckId),
  });

export const tagsQuery = () =>
  queryOptions({
    queryKey: flashcardKeys.tags,
    queryFn: () => armin.flashcards.listTags(),
  });

export const deckTagsQuery = (deckId: string) =>
  queryOptions({
    queryKey: flashcardKeys.deckTags(deckId),
    queryFn: () => armin.flashcards.listDeckTags(deckId),
  });

/** Offset-paged browse results; each page asks for the next slice. */
export const browseQuery = (filters: BrowseQueryFilters) =>
  infiniteQueryOptions({
    queryKey: flashcardKeys.browse(filters),
    queryFn: ({ pageParam }) =>
      armin.flashcards.browse({
        offset: pageParam,
        limit: BROWSE_PAGE_SIZE,
        ...filters,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (count, page) => count + page.flashcards.length,
        0,
      );
      return loaded < lastPage.filteredTotal ? loaded : undefined;
    },
  });

/** The review queue for one deck, or for every deck. */
export const reviewQueueQuery = (deckId?: string) =>
  queryOptions({
    queryKey: deckId ? reviewKeys.deck(deckId) : reviewKeys.all,
    queryFn: () => armin.review.queue(deckId),
  });

export const graphQuery = (deckId: string) =>
  queryOptions({
    queryKey: graphKeys.deck(deckId),
    queryFn: () => armin.graph.getDeck(deckId),
  });

export const settingsQuery = () =>
  queryOptions({
    queryKey: settingsKeys.current,
    queryFn: () => armin.settings.get(),
  });

/** The default sort each page opens with; prefetching any other sort would miss. */
export const DECK_PAGE_SORT = "due-soon";
export const BROWSE_PAGE_SORT = "created-new";

/*
 * Page prefetchers. Route loaders call these when the router preloads on
 * intent (hover or focus of a link) and again on navigation, without waiting,
 * so the click usually finds the data already cached; fresh cache entries are
 * left alone. They only run in the browser: these reads go over the signed-in
 * Convex socket, which server renders don't open.
 */

const inBrowser = () => typeof window !== "undefined";

export function prefetchDecksPage(queryClient: QueryClient) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(decksQuery());
}

export function prefetchDeckPage(queryClient: QueryClient, deckId: string) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(deckQuery(deckId));
  void queryClient.prefetchQuery(deckTagsQuery(deckId));
  void queryClient.prefetchInfiniteQuery(browseQuery({ sort: DECK_PAGE_SORT, deckId }));
}

export function prefetchGraphPage(queryClient: QueryClient, deckId: string) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(deckQuery(deckId));
  void queryClient.prefetchQuery(graphQuery(deckId));
}

export function prefetchBrowsePage(queryClient: QueryClient) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(decksQuery());
  void queryClient.prefetchQuery(tagsQuery());
  void queryClient.prefetchInfiniteQuery(browseQuery({ sort: BROWSE_PAGE_SORT }));
}

export function prefetchReviewPage(queryClient: QueryClient, deckId?: string) {
  if (!inBrowser()) return;
  if (deckId) void queryClient.prefetchQuery(deckQuery(deckId));
  else void queryClient.prefetchQuery(decksQuery());
  void queryClient.prefetchQuery(reviewQueueQuery(deckId));
}

export function prefetchSettingsPage(queryClient: QueryClient) {
  if (!inBrowser()) return;
  void queryClient.prefetchQuery(settingsQuery());
}
