"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FileText } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { Field } from "@base-ui/react/field";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { useKeybinding } from "@/lib/keybindings/dispatcher";
import { cn } from "@/lib/cn";

export function DecksHome() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: decks } = useQuery({
    queryKey: queryKeys.decks,
    queryFn: () => api.getDecks(),
  });

  const createDeck = useMutation({
    mutationFn: () => api.createDeck({ name, description }),
    onSuccess: () => {
      setOpen(false);
      setName("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: queryKeys.decks });
    },
  });

  useKeybinding("deck", "deck.newCard", () => {
    setOpen(true);
  });

  const totalDue = decks?.reduce((acc, d) => acc + d.dueCount, 0) ?? 0;

  return (
    <section className="flex flex-col gap-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-[var(--color-text)]">
            Decks
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {totalDue} cards due now
          </p>
        </div>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger render={<Button variant="primary" size="md" />}>
            <Plus className="h-4 w-4" />
            New deck
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-50 bg-[var(--color-canvas)]/60 backdrop-blur-sm" />
            <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--color-surface-strong)] bg-[var(--color-canvas)] p-6 shadow-xl">
              <Dialog.Title className="font-serif text-xl text-[var(--color-text)]">
                New deck
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--color-muted)]">
                A deck is a branch of your knowledge. Cards can declare
                prerequisites on the graph.
              </Dialog.Description>
              <form
                className="mt-5 flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim()) createDeck.mutate();
                }}
              >
                <Field.Root>
                  <Field.Label className="text-xs font-medium text-[var(--color-text)]">
                    Name
                  </Field.Label>
                  <Field.Control
                    required
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/60 focus:border-[var(--color-accent)]"
                    placeholder="e.g. Quantum chemistry"
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label className="text-xs font-medium text-[var(--color-text)]">
                    Description
                  </Field.Label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="mt-1.5 w-full rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/60 focus:border-[var(--color-accent)]"
                    placeholder="Optional — what keeps this branch honest?"
                  />
                </Field.Root>
                <div className="mt-1 flex justify-end gap-2">
                  <Dialog.Close render={<Button variant="ghost" size="md" />}>
                    Cancel
                  </Dialog.Close>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    busy={createDeck.isPending}
                    disabled={!name.trim()}
                  >
                    Create
                  </Button>
                </div>
              </form>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </header>

      <ul className="divide-y divide-[var(--color-surface-strong)] border-y border-[var(--color-surface-strong)]">
        {decks?.map((deck) => (
          <li key={deck.id}>
            <Link
              href={`/deck/${deck.id}`}
              className="group flex items-center justify-between gap-4 py-4 transition-colors hover:bg-[var(--color-surface)]/50"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-serif text-lg text-[var(--color-text)]">
                  <FileText className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
                  {deck.name}
                </p>
                {deck.description && (
                  <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                    {deck.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-5 font-mono text-xs">
                <span className="text-[var(--color-muted)]">
                  {deck.cardCount} cards
                </span>
                {deck.newCount > 0 && (
                  <span className="text-[var(--color-muted)]">
                    {deck.newCount} new
                  </span>
                )}
                <span
                  className={cn(
                    "w-16 text-right",
                    deck.dueCount > 0
                      ? "font-semibold text-[var(--color-accent)]"
                      : "text-[var(--color-muted)]/50",
                  )}
                >
                  {deck.dueCount} due
                </span>
              </div>
            </Link>
          </li>
        ))}
        {decks && decks.length === 0 && (
          <li className="py-12 text-center text-sm text-[var(--color-muted)]">
            No decks yet. Start one with the new-deck button.
          </li>
        )}
      </ul>
    </section>
  );
}
