import type {
  CramPool,
  Deck,
  Flashcard,
  FlashcardContent,
  PrereqGraph,
  ReviewQueue,
  Settings,
  Subscription,
} from "@/lib/shared/contracts";
import {
  allCards,
  buildReviewUnits,
  seedDecks,
  seedGraph,
  seedSettings,
  seedSubscription,
} from "@/lib/mock/data";

const delay = () => new Promise((r) => setTimeout(r, 60 + Math.random() * 140));

let decks = [...seedDecks];
let cards = [...allCards];
let graph = structuredClone(seedGraph);
let settings = structuredClone(seedSettings);
let subscription = structuredClone(seedSubscription);

export const api = {
  async getDecks(): Promise<Deck[]> {
    await delay();
    return decks.map((d) => ({ ...d }));
  },

  async getDeck(deckId: string): Promise<Deck | null> {
    await delay();
    return decks.find((d) => d.id === deckId) ?? null;
  },

  async createDeck(input: {
    name: string;
    description?: string;
  }): Promise<Deck> {
    await delay();
    const deck: Deck = {
      id: `d-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name,
      description: input.description ?? null,
      cardCount: 0,
      dueCount: 0,
      newCount: 0,
    };
    decks = [deck, ...decks];
    return { ...deck };
  },

  async getFlashcards(deckId: string): Promise<Flashcard[]> {
    await delay();
    return cards
      .filter((c) => c.deckId === deckId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((c) => structuredClone(c));
  },

  async createFlashcard(
    deckId: string,
    content: FlashcardContent,
    tags: string[] = [],
  ): Promise<Flashcard> {
    await delay();
    const card: Flashcard = {
      id: `f-${crypto.randomUUID().slice(0, 8)}`,
      deckId,
      content,
      tags,
      state: "new",
      dueAt: null,
      createdAt: Date.now(),
    };
    cards = [...cards, card];
    decks = decks.map((d) =>
      d.id === deckId ? { ...d, cardCount: d.cardCount + 1 } : d,
    );
    return structuredClone(card);
  },

  async getReviewQueue(deckId?: string): Promise<ReviewQueue> {
    await delay();
    return { units: buildReviewUnits(deckId ?? null), position: 0 };
  },

  async getCramQueue(pool: CramPool): Promise<ReviewQueue> {
    await delay();
    const selected = pool.deckIds;
    const units = buildReviewUnits(null, 999).filter(
      (u) => !selected.length || selected.includes(u.deckId),
    );
    const limit = Math.min(30, units.length);
    return { units: units.slice(0, limit), position: 0 };
  },

  async getGraph(deckId: string): Promise<PrereqGraph | null> {
    await delay();
    if (deckId !== "d-orgchem") {
      const deckCards = cards.filter((c) => c.deckId === deckId);
      if (!deckCards.length) return null;
      return {
        nodes: deckCards.map((c) => ({
          id: c.id,
          label: contentLabel(c.content),
          state: "ready" as const,
        })),
        edges: [],
      };
    }
    return structuredClone(graph);
  },

  async addEdge(deckId: string, prereqId: string, dependentId: string) {
    await delay();
    const id = `e-${crypto.randomUUID().slice(0, 8)}`;
    graph.edges = [...graph.edges, { id, prereqId, dependentId }];
    return structuredClone(graph);
  },

  async removeEdge(deckId: string, edgeId: string) {
    await delay();
    graph.edges = graph.edges.filter((e) => e.id !== edgeId);
    return structuredClone(graph);
  },

  async getSettings(): Promise<Settings> {
    await delay();
    return structuredClone(settings);
  },

  async saveSettings(next: Settings): Promise<Settings> {
    await delay();
    settings = structuredClone(next);
    return structuredClone(settings);
  },

  async getSubscription(): Promise<Subscription> {
    await delay();
    return structuredClone(subscription);
  },

  async upgradeToPro(): Promise<Subscription> {
    await delay();
    subscription = {
      plan: "pro",
      status: "active",
      aiAllowanceUsed: 0,
      aiAllowanceMonthly: 500,
      currentPeriodEnd: Date.now() + 30 * 86_400_000,
    };
    return structuredClone(subscription);
  },
};

function contentLabel(content: FlashcardContent): string {
  switch (content.type) {
    case "basic":
      return content.front;
    case "cloze":
      return content.text.replace(/\{\{c\d+::([^}]+)\}\}/g, "$1");
    case "image-occlusion":
      return "Image occlusion";
  }
}
