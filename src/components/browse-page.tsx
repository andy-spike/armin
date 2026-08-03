"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/cn";
import { formatDueAt, formatRelativeDay } from "@/lib/format";
import type { Flashcard, FlashcardState } from "@/lib/shared/contracts";

const STATE_LABELS: Record<FlashcardState, string> = {
  new: "new",
  learning: "learning",
  review: "review",
  relearning: "relearning",
  suspended: "suspended",
};

type SortKey = "due" | "created" | "deck";

export function BrowsePage() {
  const { data: decks } = useQuery({
    queryKey: queryKeys.decks,
    queryFn: () => api.getDecks(),
  });

  const deckQueries = useQuery({
    queryKey: ["allFlashcards", decks?.map((d) => d.id)],
    queryFn: async () => {
      const ids = decks?.map((d) => d.id) ?? [];
      const lists = await Promise.all(ids.map((id) => api.getFlashcards(id)));
      return lists.flat();
    },
    enabled: !!decks,
  });

  const [deckFilter, setDeckFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<FlashcardState | "all">("all");
  const [sort, setSort] = useState<SortKey>("due");
  const [query, setQuery] = useState("");

  const cards = deckQueries.data ?? [];

  const filtered = useMemo(() => {
    let list = cards;
    if (deckFilter !== "all") list = list.filter((c) => c.deckId === deckFilter);
    if (stateFilter !== "all") list = list.filter((c) => c.state === stateFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((c) =>
        JSON.stringify(c.content).toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      switch (sort) {
        case "due":
          return (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER);
        case "created":
          return b.createdAt - a.createdAt;
        case "deck":
          return a.deckId.localeCompare(b.deckId);
      }
    });
  }, [cards, deckFilter, stateFilter, sort, query]);

  const stateOptions: Array<FlashcardState | "all"> = [
    "all",
    "new",
    "learning",
    "review",
    "relearning",
    "suspended",
  ];

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-3xl text-[var(--color-text)]">Browse</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {cards.length} cards across {decks?.length ?? 0} decks
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards…"
          aria-label="Search cards"
          className="w-56 rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/60 focus:border-[var(--color-accent)]"
        />
        <select
          value={deckFilter}
          onChange={(e) => setDeckFilter(e.target.value)}
          aria-label="Filter by deck"
          className="rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
        >
          <option value="all">All decks</option>
          {decks?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort by"
          className="rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
        >
          <option value="due">Sort: due soonest</option>
          <option value="created">Sort: newest</option>
          <option value="deck">Sort: deck</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by state">
        {stateOptions.map((s) => (
          <button
            key={s}
            onClick={() => setStateFilter(s)}
            className={cn(
              "rounded-full border px-3 py-1 font-mono text-[11px] transition-colors",
              stateFilter === s
                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                : "border-[var(--color-surface-strong)] text-[var(--color-muted)] hover:text-[var(--color-text)]",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-[var(--color-surface-strong)] border-y border-[var(--color-surface-strong)]">
        {filtered.map((card) => (
          <BrowseRow key={card.id} card={card} />
        ))}
        {filtered.length === 0 && (
          <li className="py-12 text-center text-sm text-[var(--color-muted)]">
            No cards match.
          </li>
        )}
      </ul>
    </section>
  );
}

function BrowseRow({ card }: { card: Flashcard }) {
  const label = cardLabel(card);
  const deckName = useDeckName(card.deckId);
  return (
    <li className="flex items-center gap-4 py-3">
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
        {STATE_LABELS[card.state]}
      </span>
      <Link
        href={`/deck/${card.deckId}`}
        className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)] transition-colors hover:text-[var(--color-accent)]"
      >
        {label}
      </Link>
      <span className="hidden w-28 shrink-0 truncate text-xs text-[var(--color-muted)] sm:block">
        {deckName}
      </span>
      <span className="w-24 shrink-0 text-right font-mono text-[11px] text-[var(--color-muted)]">
        {card.dueAt ? formatDueAt(card.dueAt) : "new"}
      </span>
      <span className="hidden w-20 shrink-0 text-right font-mono text-[11px] text-[var(--color-muted)]/70 md:block">
        {formatRelativeDay(card.createdAt)}
      </span>
    </li>
  );
}

function useDeckName(deckId: string): string {
  const { data: decks } = useQuery({
    queryKey: queryKeys.decks,
    queryFn: () => api.getDecks(),
  });
  return decks?.find((d) => d.id === deckId)?.name ?? deckId;
}

function cardLabel(card: Flashcard): string {
  const c = card.content;
  switch (c.type) {
    case "basic":
      return c.front.replace(/<[^>]*>/g, "").trim();
    case "cloze":
      return c.text.replace(/\{\{c\d+::([^}]+)\}\}/g, "$1");
    case "image-occlusion":
      return `Image · ${c.occlusions.length} regions`;
  }
}
