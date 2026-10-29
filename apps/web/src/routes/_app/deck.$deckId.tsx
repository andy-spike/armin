import { createFileRoute, Outlet, redirect, notFound } from "@tanstack/react-router";
import { deckQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/deck/$deckId")({
  beforeLoad: async ({ context, params, location }) => {
    const deck = await context.queryClient.ensureQueryData(deckQuery(params.deckId));
    if (!deck) throw notFound();
    if (params.deckId !== deck.slug) {
      throw redirect({
        href: location.href.replace(
          `/deck/${params.deckId}`,
          `/deck/${encodeURIComponent(deck.slug)}`,
        ),
        replace: true,
      });
    }
    return { resolvedDeckId: deck.id, deckSlug: deck.slug };
  },
  component: Outlet,
});
