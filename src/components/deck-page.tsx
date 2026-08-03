"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Share2 } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { Editor } from "@/components/editor";
import { cn } from "@/lib/cn";
import type { FlashcardContent } from "@/lib/shared/contracts";

export function DeckPage() {
  const params = useParams<{ deckId: string }>();
  const deckId = params.deckId;
  const queryClient = useQueryClient();

  const { data: deck } = useQuery({
    queryKey: queryKeys.deck(deckId),
    queryFn: () => api.getDeck(deckId),
  });
  const { data: cards } = useQuery({
    queryKey: queryKeys.flashcards(deckId),
    queryFn: () => api.getFlashcards(deckId),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [type, setType] = useState<"basic" | "cloze">("basic");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [tags, setTags] = useState("");

  const createCard = useMutation({
    mutationFn: async () => {
      const content: FlashcardContent =
        type === "basic"
          ? { type: "basic", front, back }
          : { type: "cloze", text: front };
      return api.createFlashcard(
        deckId,
        content,
        tags.split(",").map((t) => t.trim()).filter(Boolean),
      );
    },
    onSuccess: () => {
      setDialogOpen(false);
      setFront("");
      setBack("");
      setTags("");
      queryClient.invalidateQueries({ queryKey: queryKeys.flashcards(deckId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.deck(deckId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.decks });
    },
  });

  if (!deck) {
    return (
      <section className="flex min-h-[50vh] items-center justify-center">
        <p className="font-mono text-xs text-[var(--color-muted)]">
          loading deck…
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <Link
          href="/"
          className="flex w-fit items-center gap-1.5 text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All decks
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-[var(--color-text)]">
              {deck.name}
            </h1>
            {deck.description && (
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {deck.description}
              </p>
            )}
            <p className="mt-2 font-mono text-xs text-[var(--color-muted)]">
              {deck.cardCount} cards · {deck.dueCount} due · {deck.newCount} new
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/deck/${deckId}/graph`}>
              <Button variant="outline" size="md">
                <Share2 className="h-4 w-4" />
                Graph
              </Button>
            </Link>
            <Link href={`/deck/${deckId}/review`}>
              <Button variant="primary" size="md">
                Review
                <span className="font-mono text-xs opacity-80">
                  {deck.dueCount}
                </span>
              </Button>
            </Link>
            <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
              <Dialog.Trigger render={<Button variant="outline" size="md" />}>
                <Plus className="h-4 w-4" />
                New card
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-50 bg-[var(--color-canvas)]/60 backdrop-blur-sm" />
                <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--color-surface-strong)] bg-[var(--color-canvas)] p-6 shadow-xl">
                  <Dialog.Title className="font-serif text-xl text-[var(--color-text)]">
                    New card
                  </Dialog.Title>
                  <div className="mt-4 flex gap-2" role="group" aria-label="Card type">
                    {(["basic", "cloze"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setType(t)}
                        className={cn(
                          "rounded-full border px-3 py-1 font-mono text-[11px] transition-colors",
                          type === t
                            ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                            : "border-[var(--color-surface-strong)] text-[var(--color-muted)] hover:text-[var(--color-text)]",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <form
                    className="mt-4 flex flex-col gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (front.trim()) createCard.mutate();
                    }}
                  >
                    <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-text)]">
                      {type === "basic" ? "Front" : "Text with {{c1::cloze}}"}
                      <Editor
                        placeholder={
                          type === "basic"
                            ? "The question…"
                            : "The {{c1::answer}} goes inside braces…"
                        }
                        value={front}
                        onChange={setFront}
                        autofocus
                      />
                    </label>
                    {type === "basic" && (
                      <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-text)]">
                        Back
                        <Editor
                          placeholder="The answer…"
                          value={back}
                          onChange={setBack}
                        />
                      </label>
                    )}
                    <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-text)]">
                      Tags
                      <input
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="mechanisms, carbonyl (comma separated)"
                        className="rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/60 focus:border-[var(--color-accent)]"
                      />
                    </label>
                    <div className="flex justify-end gap-2">
                      <Dialog.Close render={<Button variant="ghost" size="md" />}>
                        Cancel
                      </Dialog.Close>
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        busy={createCard.isPending}
                        disabled={!front.trim()}
                      >
                        Add card
                      </Button>
                    </div>
                  </form>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>
      </header>

      <ul className="divide-y divide-[var(--color-surface-strong)] border-y border-[var(--color-surface-strong)]">
        {cards?.map((card) => (
          <li
            key={card.id}
            className="flex items-center gap-4 py-3.5"
          >
            <span
              className={cn(
                "w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider",
                card.state === "suspended"
                  ? "text-[var(--color-muted)]/50 line-through"
                  : card.state === "new"
                    ? "text-[var(--color-easy)]"
                    : card.state === "learning" || card.state === "relearning"
                      ? "text-[var(--color-hard)]"
                      : "text-[var(--color-muted)]",
              )}
            >
              {card.state}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
              {cardLabel(card)}
            </p>
            <span className="hidden shrink-0 font-mono text-[10px] uppercase text-[var(--color-muted)]/70 sm:block">
              {card.content.type}
            </span>
          </li>
        ))}
        {cards && cards.length === 0 && (
          <li className="py-12 text-center text-sm text-[var(--color-muted)]">
            No cards yet. Add your first one.
          </li>
        )}
      </ul>
    </section>
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function cardLabel(card: { content: FlashcardContent }): string {
  const c = card.content;
  switch (c.type) {
    case "basic":
      return stripHtml(c.front);
    case "cloze":
      return c.text.replace(/\{\{c\d+::([^}]+)\}\}/g, "$1");
    case "image-occlusion":
      return `Image · ${c.occlusions.length} regions`;
  }
}
