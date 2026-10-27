import { CARD_NODE_HEIGHT } from "@/lib/graph-dimensions";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Loading placeholders that mirror each page's loaded layout box for box, so
 * real content replaces them in place instead of pushing the page around.
 * Static chrome (page titles) renders as real text; anything that depends on
 * data renders as a Skeleton with the same line box as the text it stands in
 * for. Keep these in step with the pages when their layout changes.
 */

/** A Skeleton bar vertically centered in a line box of the given height. */
function Line({ box, className }: { box: string; className: string }) {
  return (
    <div className={cn("flex items-center", box)}>
      <Skeleton className={className} />
    </div>
  );
}

function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">{children}</h1>;
}

/** One filter field: a label line above a 36px control. */
function FieldSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Line box="h-3.5" className="h-3 w-12" />
      <Skeleton className="h-9 w-full rounded-none" />
    </div>
  );
}

/** Mirrors Browse's State, Deck, Tag, and Sort fields, including their widths. */
function BrowseFilterBarSkeleton() {
  return (
    <div className="mb-5 border border-border bg-bg-2 px-4 py-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <FieldSkeleton className="w-36" />
          <FieldSkeleton className="w-52" />
          <FieldSkeleton className="w-44" />
        </div>
        <FieldSkeleton className="w-44" />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Decks */

export function DeckTileSkeleton() {
  return (
    <li className="border border-border bg-surface p-5">
      <Line box="h-7" className="h-5 w-2/3" />
      <Line box="mt-1 h-5" className="h-3.5 w-full" />
      <div className="mt-4 flex h-4 items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="mt-1.5 h-1.5 w-full rounded-full" />
      <div className="mt-2.5 flex h-4 items-center gap-3">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
      </div>
    </li>
  );
}

/** Sort row and deck grid; the Decks page renders its own header above. */
export function DeckGridSkeleton() {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Skeleton className="h-9 w-[198px] rounded-none" />
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <DeckTileSkeleton key={i} />
        ))}
      </ul>
    </>
  );
}

function DecksPageSkeleton() {
  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Decks</PageTitle>
          <Line box="mt-1.5 h-5" className="h-3.5 w-56" />
        </div>
        <Skeleton className="h-9 w-[123px] rounded-none" />
      </header>
      <DeckGridSkeleton />
    </div>
  );
}

/* ------------------------------------------------------------ Flashcards */

/** Mirrors FlashcardTile; `showDeck` adds Browse's deck-name line. */
export function FlashcardTileSkeleton({ showDeck = false }: { showDeck?: boolean }) {
  const badges = (
    <div className="flex items-center gap-1.5">
      <Skeleton className="h-5 w-14 rounded-sm" />
      <Skeleton className="h-5 w-20 rounded-sm" />
    </div>
  );
  return (
    <li className="flex min-h-[13.5rem] flex-col border border-border bg-surface p-4">
      <div className="flex h-8 items-center justify-between gap-2">
        {showDeck ? <Skeleton className="h-3 w-32" /> : badges}
        <Skeleton className="h-4 w-5 shrink-0 rounded-sm" />
      </div>
      {showDeck && <div className="mt-2 flex h-[21px] items-center">{badges}</div>}
      <div className="mt-3 flex flex-1 flex-col">
        <div className="flex flex-col gap-1">
          <Line box="h-5" className="h-3.5 w-full" />
          <Line box="h-5" className="h-3.5 w-3/5" />
          <Line box="h-[21px]" className="h-3 w-4/5" />
        </div>
        <div className="mt-auto flex pt-3">
          <Skeleton className="h-[21px] w-11 rounded-sm" />
        </div>
      </div>
    </li>
  );
}

/** Count line and tile grid shared by Browse and the deck page. */
export function FlashcardGridSkeleton({ showDeck = false }: { showDeck?: boolean }) {
  return (
    <>
      <Line box="mb-3 h-4" className="h-3 w-28" />
      <ul className="card-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <FlashcardTileSkeleton key={i} showDeck={showDeck} />
        ))}
      </ul>
    </>
  );
}

/** Filter bar and grid; the Browse page renders its own header above. */
export function BrowseContentSkeleton() {
  return (
    <>
      <BrowseFilterBarSkeleton />
      <FlashcardGridSkeleton showDeck />
    </>
  );
}

function BrowsePageSkeleton() {
  return (
    <div>
      <header className="mb-6">
        <PageTitle>Browse</PageTitle>
        <p className="mt-1.5 text-sm text-muted">
          Every flashcard across your decks. Filter and sort to find anything.
        </p>
      </header>
      <BrowseContentSkeleton />
    </div>
  );
}

/* ------------------------------------------------------------------ Deck */

export function DeckHeaderSkeleton() {
  return (
    <header className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1">
        <Line box="h-[42px]" className="h-8 w-full max-w-xs" />
        <Line box="mt-1 h-5" className="h-3.5 w-48" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-[99px] rounded-none" />
        <Skeleton className="h-9 w-9 rounded-none" />
        <Skeleton className="h-9 w-[104px] rounded-none" />
        <Skeleton className="h-9 w-[117px] rounded-none" />
      </div>
    </header>
  );
}

/** Tag filter, sort, and card grid below the deck header. */
export function DeckCardsSkeleton({ withFilters = true }: { withFilters?: boolean }) {
  return (
    <>
      {withFilters && (
        <div className="mb-5 border border-border bg-bg-2 px-4 py-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <FieldSkeleton className="w-44" />
            <FieldSkeleton className="w-44" />
          </div>
        </div>
      )}
      <FlashcardGridSkeleton />
    </>
  );
}

function DeckPageSkeleton() {
  return (
    <div>
      {/* The inline "All decks" link sits in a 24px line box. */}
      <Line box="h-6" className="h-3.5 w-20" />
      <DeckHeaderSkeleton />
      <DeckCardsSkeleton />
    </div>
  );
}

/* ---------------------------------------------------------------- Review */

/** Progress row, card face, and answer controls of a review session. */
export function ReviewCardSkeleton() {
  return (
    <div className="mt-8">
      <div className="mb-8 flex h-8 items-center gap-3">
        <Skeleton className="h-1.5 flex-1 rounded-full" />
        <Skeleton className="h-8 w-[83px] rounded-none" />
      </div>
      <Skeleton className="h-[260px] w-full rounded-xl sm:h-[300px]" />
      <div className="mt-6 flex h-11 gap-2">
        <Skeleton className="h-11 w-[46px] rounded-none" />
        <Skeleton className="h-11 flex-1 rounded-none" />
        <Skeleton className="h-11 w-[46px] rounded-none" />
      </div>
    </div>
  );
}

/** Stands in for the deck name and position shown beside a review card. */
export function ReviewMetaSkeleton() {
  return (
    <div className="ml-auto flex h-4 shrink-0 items-center gap-3">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-3 w-9" />
    </div>
  );
}

function ReviewPageSkeleton({ deckReview }: { deckReview: boolean }) {
  return (
    <div className="mx-auto max-w-2xl">
      {deckReview ? (
        <Line box="h-6" className="h-3.5 w-24" />
      ) : (
        <div className="flex items-center justify-between gap-4">
          <PageTitle>Review</PageTitle>
          <Skeleton className="h-7 w-40 rounded-none" />
        </div>
      )}
      <div className="mt-1.5 flex items-baseline justify-between gap-4">
        {!deckReview && <Line box="h-5" className="h-3.5 w-64" />}
        <ReviewMetaSkeleton />
      </div>
      <ReviewCardSkeleton />
    </div>
  );
}

/* ----------------------------------------------------------------- Graph */

/** Where the canvas puts a deck's cards before any are saved: one column from the origin. */
const GRAPH_FALLBACK_NODES = [0, 188, 376].map((y) => ({ x: 0, y }));
/** The canvas's first-visit view, matching `DEFAULT_VIEWPORT` in the graph. */
const GRAPH_DEFAULT_VIEWPORT = { x: 48, y: 48, zoom: 1 };
/** Enough placeholders to fill a view without mounting a large deck. */
const GRAPH_SKELETON_NODE_LIMIT = 40;

/**
 * The graph canvas chrome (back/search, tidy, zoom, minimap) at React Flow's
 * panel positions, plus card placeholders drawn through the same view the
 * canvas opens with, so they sit where the cards land. Pass the deck's saved
 * view and, once loaded, its card positions; without them the placeholders
 * follow the canvas's first-visit layout.
 */
export function GraphSkeleton({
  viewport = GRAPH_DEFAULT_VIEWPORT,
  nodes,
}: {
  viewport?: { x: number; y: number; zoom: number };
  nodes?: { x: number; y: number }[];
}) {
  const placeholders = (nodes?.length ? nodes : GRAPH_FALLBACK_NODES).slice(
    0,
    GRAPH_SKELETON_NODE_LIMIT,
  );

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        {placeholders.map((node, i) => (
          <div
            key={i}
            className="absolute flex w-[240px] flex-col gap-2 border border-border bg-surface px-3.5 py-3"
            style={{ left: node.x, top: node.y, height: CARD_NODE_HEIGHT }}
          >
            <Skeleton className="h-5 w-14 rounded-sm" />
            <Skeleton className="mt-1 h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="mt-auto h-3 w-2/3" />
          </div>
        ))}
      </div>
      <div className="absolute left-[15px] top-[15px] flex gap-2">
        <Skeleton className="h-8 w-40 rounded-none" />
        <Skeleton className="h-8 w-[198px] rounded-none" />
      </div>
      <Skeleton className="absolute right-[15px] top-[15px] h-[30px] w-[105px] rounded-none" />
      <Skeleton className="absolute bottom-[15px] right-[15px] h-[30px] w-[174px] rounded-none" />
      <div className="absolute bottom-[15px] left-[15px] hidden h-[110px] w-40 border border-border bg-surface md:block" />
    </div>
  );
}

function GraphPageSkeleton() {
  return (
    <div className="relative h-full w-full bg-bg">
      <GraphSkeleton />
    </div>
  );
}

/* -------------------------------------------------------------- Settings */

function SettingsSectionSkeleton({ rows, hintLines = 1 }: { rows: number; hintLines?: number }) {
  return (
    <section className="grid gap-x-10 gap-y-4 md:grid-cols-[240px_1fr]">
      <div className="pt-0.5">
        <Line box="h-5" className="h-3.5 w-32" />
        <Line box="mt-1 h-[18px]" className="h-3 w-full" />
        <Line box="h-[18px]" className="h-3 w-2/3" />
      </div>
      <div className="self-start border border-border bg-surface">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center justify-between gap-6 px-4 py-3.5",
              i < rows - 1 && "border-b border-border",
            )}
          >
            <div className="min-w-0 flex-1">
              <Line box="h-5" className="h-3.5 w-36" />
              <Line box="mt-0.5 h-5" className="h-3 w-3/5" />
              {hintLines > 1 && <Line box="h-5" className="h-3 w-2/5" />}
            </div>
            <Skeleton className="h-9 w-24 shrink-0 rounded-none" />
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsPageSkeleton() {
  return (
    <div className="pb-24">
      <header className="mb-8">
        <PageTitle>Settings</PageTitle>
      </header>
      <div className="flex flex-col gap-12">
        <div className="flex h-[37px] items-center gap-6 px-3">
          {[64, 60, 54, 30, 80].map((width) => (
            <Skeleton key={width} className="h-3.5" style={{ width }} />
          ))}
        </div>
        <div className="space-y-10">
          <SettingsSectionSkeleton rows={1} hintLines={2} />
          <SettingsSectionSkeleton rows={6} />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Router */

/**
 * The skeleton for whichever page `pathname` will show. Used by the signed-in
 * frame while it waits for the account, before any page can mount.
 */
export function PageSkeleton({ pathname }: { pathname: string }) {
  if (pathname === "/browse") return <BrowsePageSkeleton />;
  if (pathname === "/review") return <ReviewPageSkeleton deckReview={false} />;
  if (pathname.startsWith("/settings")) return <SettingsPageSkeleton />;
  if (pathname.startsWith("/deck/")) {
    if (pathname.endsWith("/graph")) return <GraphPageSkeleton />;
    if (pathname.endsWith("/review")) return <ReviewPageSkeleton deckReview />;
    return <DeckPageSkeleton />;
  }
  return <DecksPageSkeleton />;
}
