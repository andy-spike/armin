import { createFileRoute, Link } from "@tanstack/react-router";
import { plural } from "@/lib/utils";
import { armin, errorMessage, newRequestId } from "@/lib/armin-client";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, AlertTriangle, Ellipsis, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Progress } from "@/components/ui/progress";
import { DeckGridSkeleton } from "@/components/page-skeletons";
import { EmptyState } from "@/components/ui/empty-state";
import { SortControl } from "@/components/sort-control";
import { AnkiImportDialog, preloadAnkiImportDialog } from "@/components/anki-import-dialog-lazy";
import { DeckActionItems, useDeckActions } from "@/components/deck-actions";
import { useToast } from "@/components/ui/toast";
import { DECK_SORT_OPTIONS, sortDecks, type DeckSortKey } from "@/lib/sort-decks";
import type { UiDeck } from "@/types/view-models";
import { useStudyClock } from "@/lib/study-clock";
import {
  decksQuery as decksQueryOptions,
  prefetchDeckPage,
  prefetchDecksPage,
} from "@/lib/queries";

function DecksPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [closingAfterCreate, setClosingAfterCreate] = useState(false);
  const [sort, setSort] = useState<DeckSortKey>("name-asc");
  // One request id per create dialog, so a retried submit can't add two decks.
  const createRequestId = useRef(newRequestId());

  const decksQuery = useQuery(decksQueryOptions(useStudyClock()));
  const deckActions = useDeckActions();

  const decks = decksQuery.data ?? [];
  const sortedDecks = useMemo(
    () => sortDecks(decksQuery.data ?? [], sort),
    [decksQuery.data, sort],
  );

  const createDeck = useMutation({
    mutationFn: (input: { name: string; description?: string | null }) =>
      armin.decks.create({ ...input, requestId: createRequestId.current }),
    onSuccess: (_deck, input) => {
      toast({ tone: "success", title: "Deck created", description: input.name });
      setClosingAfterCreate(true);
      setOpen(false);
    },
    onError: (error) => {
      toast({ tone: "error", title: "Couldn’t create deck", description: errorMessage(error) });
    },
  });

  const create = () => {
    if (!name.trim()) return;
    createDeck.mutate({
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
    });
  };

  const handleCreateDialogExit = () => {
    if (closingAfterCreate) {
      setName("");
      setDescription("");
      setClosingAfterCreate(false);
      createRequestId.current = newRequestId();
    }
  };

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">Decks</h1>
          <p className="mt-1.5 text-sm text-muted">
            {!decksQuery.isLoading
              ? `${decks.length} ${decks.length === 1 ? "deck" : "decks"}, building toward what's next.`
              : "Your study decks live here."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ImportButton onClick={() => setImportOpen(true)} />
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New deck
          </Button>
        </div>
      </header>

      {decksQuery.isLoading && <DeckGridSkeleton />}

      {decksQuery.isError && (
        <div className="flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center bg-relearning-bg text-relearning">
            <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-ink">Couldn&apos;t load your decks</h3>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">
            Check your connection and try again. Your saved data is safe.
          </p>
          <Button variant="outline" className="mt-5" onClick={() => void decksQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!decksQuery.isLoading && !decksQuery.isError && decks.length === 0 && (
        <EmptyState
          icon={Layers}
          title="No decks yet"
          description="A deck is a set of flashcards on one subject. Create your first one, then add flashcards and organize their prerequisites."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Create your first deck
              </Button>
              <ImportButton onClick={() => setImportOpen(true)} />
            </div>
          }
        />
      )}

      {!decksQuery.isLoading && !decksQuery.isError && decks.length > 0 && (
        <div className="mb-4 flex justify-end">
          <SortControl value={sort} onChange={setSort} options={DECK_SORT_OPTIONS} />
        </div>
      )}

      {!decksQuery.isLoading && !decksQuery.isError && decks.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedDecks.map((deck) => (
            <li key={deck.id}>
              <DeckTile
                deck={deck}
                onPrefetch={() => prefetchDeckPage(queryClient, deck.id)}
                onRename={() => deckActions.rename(deck)}
                onDelete={() => deckActions.remove(deck)}
              />
            </li>
          ))}
        </ul>
      )}

      <AnkiImportDialog open={importOpen} onClose={() => setImportOpen(false)} />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        onExitComplete={handleCreateDialogExit}
        title="New deck"
        description="Name it for the subject you're learning."
      >
        <div className="space-y-3">
          <Input
            aria-label="Deck name"
            placeholder="e.g. JavaScript Fundamentals"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
          />
          <AutoGrowTextarea
            aria-label="Deck description"
            placeholder="What this deck covers (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minHeight={100}
            maxHeight={240}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim()}
              busy={createDeck.isPending || closingAfterCreate}
              onClick={create}
            >
              Create deck
            </Button>
          </div>
        </div>
      </Dialog>

      {deckActions.dialogs}
    </div>
  );
}

function ImportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      onPointerEnter={preloadAnkiImportDialog}
      onFocus={preloadAnkiImportDialog}
    >
      <Upload className="h-4 w-4" /> Import from Anki
    </Button>
  );
}

function DeckTile({
  deck,
  onPrefetch,
  onRename,
  onDelete,
}: {
  deck: UiDeck;
  onPrefetch: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const pct = deck.total > 0 ? Math.round((deck.learned / deck.total) * 100) : 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="group relative flex h-full cursor-pointer flex-col border border-border bg-surface p-5 transition-colors duration-150 hover:border-border-strong hover:bg-surface-sunken"
        onPointerEnter={onPrefetch}
        onFocus={onPrefetch}
        onPointerDown={onPrefetch}
      >
        <Link
          to="/deck/$deckId"
          params={{ deckId: deck.id }}
          aria-label={`Open deck: ${deck.name}`}
          className="absolute inset-0 z-10 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="pointer-events-none relative z-20 flex flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 flex-1 font-serif text-lg font-semibold text-ink">
              {deck.name}
            </h2>
            <div className="pointer-events-auto relative z-20 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Deck actions"
                      className="-mt-1.5 -mr-1.5"
                    />
                  }
                >
                  <Ellipsis className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DeckActionItems
                    onRename={onRename}
                    onDelete={onDelete}
                    Item={DropdownMenuItem}
                    Separator={DropdownMenuSeparator}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="mt-1 flex flex-1 flex-col">
            {deck.description && (
              <p className="line-clamp-2 text-sm text-muted">{deck.description}</p>
            )}
            <div className="mt-4 flex flex-1 flex-col justify-end">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{plural(deck.total, "flashcard")}</span>
                <span>{pct}% learned</span>
              </div>
              <Progress
                value={deck.learned}
                max={deck.total}
                tone="good"
                className="mt-1.5"
                label={`${deck.name} learned`}
              />
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {deck.due > 0 && <Stat color="bg-accent" label={`${deck.due} due`} emphatic />}
                {deck.newCount > 0 && <Stat color="bg-new" label={`${deck.newCount} new`} />}
                {deck.learning > 0 && (
                  <Stat color="bg-learning" label={`${deck.learning} learning`} />
                )}
                {deck.due === 0 && deck.newCount === 0 && (
                  <span className="text-muted">All caught up</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="min-w-40">
        <DeckActionItems
          onRename={onRename}
          onDelete={onDelete}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function Stat({ color, label, emphatic }: { color: string; label: string; emphatic?: boolean }) {
  return (
    <span
      className={
        emphatic
          ? "inline-flex items-center gap-1.5 font-medium text-ink"
          : "inline-flex items-center gap-1.5 text-muted"
      }
    >
      <span className={`h-1.5 w-1.5 ${color}`} aria-hidden />
      {label}
    </span>
  );
}

export const Route = createFileRoute("/_app/")({
  // The signed-out landing page renders from the `_app` frame instead.
  loader: ({ context }) => (context.landing ? undefined : prefetchDecksPage(context.queryClient)),
  head: ({ match }) => (match.context.landing ? {} : { meta: [{ title: "Decks · Armin" }] }),
  component: DecksPage,
});
