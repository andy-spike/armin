import type { QueryClient } from "@tanstack/react-query";
import { decksQuery } from "@/lib/queries";

/** A deck's row from the cached deck list, to show its page before its own query loads. */
export function getCachedDeckDetail(queryClient: QueryClient, deckId: string) {
  return queryClient.getQueryData(decksQuery().queryKey)?.find((deck) => deck.id === deckId);
}

export function getCachedDeckDetailUpdatedAt(queryClient: QueryClient, deckId: string) {
  return getCachedDeckDetail(queryClient, deckId)
    ? queryClient.getQueryState(decksQuery().queryKey)?.dataUpdatedAt
    : undefined;
}
