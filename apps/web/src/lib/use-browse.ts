import { useState } from "react";
import {
  keepPreviousData,
  useQueries,
  useQuery,
  type QueryObserverResult,
} from "@tanstack/react-query";
import type { BrowseQueryFilters } from "@/lib/armin-query";
import { browseCountsQuery, browsePageQuery, type BrowsePageSpec } from "@/lib/queries";

const FIRST_PAGE: BrowsePageSpec[] = [{ cursor: null }];

type PageResult = QueryObserverResult<
  Awaited<ReturnType<NonNullable<ReturnType<typeof browsePageQuery>["queryFn"]>>>
>;

/** Merge the pages; TanStack keeps the result's identity while no page changes. */
function combinePages(results: PageResult[]) {
  const seen = new Set<string>();
  const last = results.at(-1);
  return {
    flashcards: results
      .flatMap((result) => result.data?.page ?? [])
      .filter((flashcard) => !seen.has(flashcard.id) && Boolean(seen.add(flashcard.id))),
    last: last && {
      data: last.data,
      isPlaceholderData: last.isPlaceholderData,
    },
    isLoading: Boolean(results[0]?.isLoading),
    isError: results.some((result) => result.isError),
    refetch: () => results.forEach((result) => void result.refetch()),
  };
}

/**
 * Browse results as live, cursor-paged subscriptions. Loading more pins the
 * last page's end to its cursor (Convex's `endCursor`), so as cards change,
 * each page grows or shrinks in place instead of leaving a gap or a repeat at
 * the page boundary. Changing the filters starts over at the first page.
 */
export function useBrowse(filters: BrowseQueryFilters) {
  const filtersKey = JSON.stringify(filters);
  const [paging, setPaging] = useState({ filtersKey, pages: FIRST_PAGE });
  const pages = paging.filtersKey === filtersKey ? paging.pages : FIRST_PAGE;

  const { flashcards, last, isLoading, isError, refetch } = useQueries({
    queries: pages.map((page) => ({
      ...browsePageQuery(filters, page),
      placeholderData: keepPreviousData,
    })),
    combine: combinePages,
  });
  const counts = useQuery({ ...browseCountsQuery(filters), placeholderData: keepPreviousData });

  const hasNextPage = Boolean(last?.data && !last.data.isDone);
  const isFetchingNextPage = pages.length > 1 && !last?.data;

  function fetchNextPage() {
    const lastPage = pages.at(-1)!;
    const cursor = last?.data?.continueCursor;
    if (!cursor || last?.data?.isDone || last?.isPlaceholderData) return;
    setPaging({
      filtersKey,
      pages: [...pages.slice(0, -1), { ...lastPage, endCursor: cursor }, { cursor }],
    });
  }

  return {
    flashcards,
    filteredTotal: counts.data?.filteredTotal ?? 0,
    /** The filtered total is a lower bound in a very large library. */
    filteredCapped: counts.data?.filteredCapped ?? false,
    filteredArchived: counts.data?.filteredArchived ?? 0,
    libraryTotal: counts.data?.libraryTotal ?? 0,
    libraryArchived: counts.data?.libraryArchived ?? 0,
    isLoading: isLoading || counts.isLoading,
    isError: isError || counts.isError,
    refetch: () => {
      refetch();
      void counts.refetch();
    },
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  };
}
