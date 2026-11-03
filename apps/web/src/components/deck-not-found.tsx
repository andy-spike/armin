import { Link } from "@tanstack/react-router";
import { ArrowLeft, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const backLinkClass =
  "inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function AllDecksLink() {
  return (
    <Link to="/" className={backLinkClass}>
      <ArrowLeft className="h-4 w-4" /> All decks
    </Link>
  );
}

export function BackToDeckLink({ deckSlug }: { deckSlug: string }) {
  return (
    <Link to="/deck/$deckId" params={{ deckId: deckSlug }} className={backLinkClass}>
      <ArrowLeft className="h-4 w-4" /> Back to deck
    </Link>
  );
}

/** A deck page whose deck isn't in the library. */
export function DeckNotFound() {
  return (
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
  );
}

/** A review or cram session whose deck isn't in the library. */
export function SessionDeckNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mt-16 flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
        <h2 className="text-xl font-semibold">Deck not found</h2>
        <p className="mt-1 text-sm text-muted">This deck isn&apos;t in your library anymore.</p>
        <Link to="/" className="mt-6">
          <Button variant="outline">Back to decks</Button>
        </Link>
      </div>
    </div>
  );
}
