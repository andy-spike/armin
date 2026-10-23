import { ArrowLeft, LayoutGrid, Search, X } from "lucide-react";
import { TruncatedLabel } from "@/components/ui/truncated-label";
import type { useGraphSearch } from "./use-graph-search";

/**
 * Back button, card search, and Tidy layout across the top of the canvas.
 * Rendered before the canvas so keyboard users reach these controls before
 * tabbing through every card.
 */
export function GraphToolbar({
  deckName,
  onBack,
  search,
  onTidy,
}: {
  deckName?: string;
  onBack?: () => void;
  search: ReturnType<typeof useGraphSearch>;
  onTidy: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 @container">
      <div className="flex items-center gap-2 *:pointer-events-auto">
        {(onBack || deckName) && (
          <button
            type="button"
            onClick={onBack}
            disabled={!onBack}
            aria-label={deckName ? `Back to ${deckName}` : "Back to deck"}
            className="flex h-8 min-w-0 items-center gap-1.5 border border-border bg-surface px-2 text-xs font-medium text-ink shadow-overlay transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:hover:bg-surface"
          >
            {onBack && <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted" />}
            {deckName && (
              <TruncatedLabel
                label={deckName}
                side="bottom"
                className="max-w-44"
              />
            )}
          </button>
        )}
        <div className="relative flex h-8 min-w-28 flex-1 items-center gap-1.5 border border-border bg-surface px-2 shadow-overlay focus-within:ring-2 focus-within:ring-accent @xl:flex-none">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
          <input
            aria-label="Search flashcards"
            placeholder="Search cards…"
            value={search.search}
            onChange={(event) => search.setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && search.hasMatches) {
                event.preventDefault();
                search.stepThroughMatches(event.shiftKey ? -1 : 1);
              }
            }}
            className="w-full min-w-0 bg-transparent text-xs text-ink outline-none placeholder:text-muted @xl:w-40"
          />
          {search.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => search.setSearch("")}
              className="text-muted transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {search.status && (
            <p
              role="status"
              title={
                search.stepping ? "Shift+Enter for the previous match" : undefined
              }
              className="pointer-events-none absolute top-full left-0 mt-1 w-max max-w-64 border border-border bg-surface px-2 py-1 text-[0.6875rem] leading-snug text-muted shadow-overlay"
            >
              {search.status}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onTidy}
          aria-label="Tidy layout"
          className="ml-auto inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border border-border bg-surface px-2.5 text-xs font-medium text-ink shadow-overlay transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span>
            Tidy<span className="hidden @xl:inline"> layout</span>
          </span>
        </button>
      </div>
    </div>
  );
}
