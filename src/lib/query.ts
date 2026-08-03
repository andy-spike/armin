export const queryKeys = {
  decks: ["decks"] as const,
  deck: (id: string) => ["deck", id] as const,
  flashcards: (deckId: string) => ["flashcards", deckId] as const,
  reviewQueue: (deckId?: string) => ["reviewQueue", deckId ?? "all"] as const,
  cramQueue: (pool: string) => ["cramQueue", pool] as const,
  graph: (deckId: string) => ["graph", deckId] as const,
  settings: ["settings"] as const,
  subscription: ["subscription"] as const,
};
