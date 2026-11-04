import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@armin/backend/api";
import type { Id } from "@armin/backend/types";
import type { SessionCard } from "@armin/core/review-session";
import { toUiReviewUnit, type UiReviewUnit } from "@/types/view-models";

/** How many cards ahead of the current one load their content. */
const CONTENT_WINDOW = 8;

/**
 * The queue carries metadata only; this loads the text of the card on screen
 * and the next few through one live `review.items` subscription. A card's
 * content stays as first shown while reactive updates for it arrive, so an
 * edit elsewhere never rewrites the card mid-answer.
 */
export function useCardContent({
  cards,
  index,
  resetKey,
}: {
  cards: SessionCard<UiReviewUnit>[];
  index: number;
  resetKey?: string;
}) {
  const descriptor = cards[index];
  const contentWindow = cards.slice(index, index + CONTENT_WINDOW);
  const contents = useQuery({
    ...convexQuery(api.review.items, {
      ids: contentWindow.map((item) => item.id as Id<"reviewUnits">),
    }),
    enabled: Boolean(descriptor && descriptor.hydrated === false),
    gcTime: 30_000,
  });
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
      const displayedKey = descriptor ? `${descriptor.id}:${descriptor.version}` : undefined;
      if (key !== displayedKey || !next.has(key)) next.set(key, toUiReviewUnit(item));
    }
    setContentCache({ resetKey, source: contents.data, cards: next });
  }
  const hydratedCards = contentCache.cards;
  const card = useMemo(() => {
    if (descriptor?.hydrated !== false) return descriptor;
    const hydrated = hydratedCards.get(`${descriptor.id}:${descriptor.version}`);
    return hydrated ? { ...descriptor, ...hydrated } : undefined;
  }, [descriptor, hydratedCards]);
  const loading = Boolean(descriptor && !card && !contents.isError && !contents.data);

  return { descriptor, card, contents, loading };
}
