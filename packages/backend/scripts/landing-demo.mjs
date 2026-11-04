import { randomUUID } from "node:crypto";
import { anyApi as api } from "convex/server";
import { ensureDemoAccount, signInDemoAccount } from "./demo-account.mjs";
import { assertTarget, readState } from "./dev-environment.mjs";

/**
 * The example library the landing page's clips are recorded from: one deck,
 * "Fundamentals of LLMs", in its own account on this checkout's local
 * deployment. Every run starts the deck over, so the clips always begin from
 * the same state. See apps/web/scripts/record-landing-clips.mjs.
 */
export const LANDING_ACCOUNT = {
  email: "armin.arlert@example.com",
  password: "armin-landing-1234",
  name: "Armin Arlert",
};

export const LANDING_DECK = "Fundamentals of LLMs";

/** Cards the deck starts with. Self-attention is written on camera instead. */
const CARDS = [
  {
    key: "tokens",
    front: "What is a token?",
    back: "A chunk of text, often part of a word, that the model reads and writes as one unit.",
  },
  {
    key: "embeddings",
    front: "What is an embedding?",
    back: "A vector that stands for a token, placing tokens with similar meanings close together.",
  },
  {
    key: "next",
    front: "What does a language model predict at each step?",
    back: "A probability distribution over the next token.",
  },
  {
    key: "context",
    front: "What is a context window?",
    back: "The most tokens a model can take in at once: the prompt plus everything it has written so far.",
  },
  {
    key: "transformer",
    front: "What makes up a transformer block?",
    back: "Self-attention followed by a feed-forward network, each wrapped in a residual connection and normalization.",
  },
  {
    key: "pretraining",
    front: "What is a base model trained to do?",
    back: "Predict the next token across a very large body of text.",
  },
  {
    key: "finetuning",
    front: "What does fine-tuning add to a pretrained model?",
    back: "More training on curated examples, so it follows instructions or does a specific task.",
  },
  {
    key: "incontext",
    front: "What is in-context learning?",
    back: "Picking up a task from examples in the prompt, without changing the model's weights.",
  },
];

/** The card the first clip writes, and the links the second clip drags. */
export const WRITTEN_CARD = {
  key: "attention",
  front: "What does self-attention let each token do?",
  back: "Weigh every other token in the context when building its own representation.",
};

/** Links that exist before recording, as [prerequisite, dependent]. */
const LINKS = [
  ["tokens", "context"],
  ["next", "pretraining"],
  ["pretraining", "finetuning"],
  ["context", "incontext"],
  ["transformer", "incontext"],
];

/** Links added once the written card exists, before the linking clip. */
const WRITTEN_LINKS = [["attention", "transformer"]];

/**
 * Graph positions on a grid, foundations at the top: columns 300 px apart and
 * rows 220 px, matching the graph view's card size.
 */
const LAYOUT = {
  tokens: [0, 0],
  embeddings: [300, 0],
  next: [600, 0],
  context: [0, 220],
  attention: [300, 220],
  pretraining: [600, 220],
  transformer: [300, 440],
  finetuning: [600, 440],
  incontext: [150, 660],
};

/**
 * Resets the landing deck and returns a client signed in as its account,
 * plus helpers the recorder uses between clips.
 */
export async function prepareLandingDemo() {
  const state = readState();
  const values = assertTarget(state);
  await ensureDemoAccount(LANDING_ACCOUNT);
  const { client, signOut } = await signInDemoAccount(values, state, LANDING_ACCOUNT);
  const request = (label) => `landing:${label}:${randomUUID()}`;

  await client.mutation(api.account.ensureLibrary, { timeZone: "UTC" });
  // Plenty of new cards per day, so repeated runs on one day still have the
  // foundations to review.
  await client.mutation(api.settings.update, { newReviewUnitsPerDay: 1000 });
  for (const deck of (await client.query(api.decks.list, {})) ?? []) {
    await client.mutation(api.decks.remove, { deckId: deck.id });
  }

  const { id: deckId } = await client.mutation(api.decks.create, {
    name: LANDING_DECK,
    description: "How large language models read, predict, and learn.",
    requestId: request("deck"),
  });
  const ids = new Map();
  for (const card of CARDS) {
    const { id } = await client.mutation(api.flashcards.create, {
      deckId,
      type: "basic",
      content: { front: card.front, back: card.back },
      tags: ["llm"],
      requestId: request(card.key),
    });
    ids.set(card.key, id);
  }

  const link = async (pairs) => {
    for (const [prereq, dependent] of pairs) {
      const graph = await client.query(api.graph.getDeck, { deckId });
      await client.mutation(api.graph.addPrereq, {
        prereqId: ids.get(prereq),
        dependentId: ids.get(dependent),
        expectedVersion: graph.version,
      });
    }
  };
  const place = async () => {
    const graph = await client.query(api.graph.getDeck, { deckId });
    await client.mutation(api.graph.saveLayout, {
      deckId,
      expectedVersion: graph.version,
      placements: [...ids].map(([key, id]) => ({
        flashcardId: id,
        x: LAYOUT[key][0],
        y: LAYOUT[key][1],
      })),
    });
  };
  await link(LINKS);
  await place();

  const deck = (await client.query(api.decks.list, {})).find((d) => d.id === deckId);
  return {
    siteUrl: state.siteUrl,
    deckPath: `/deck/${deck.slug}`,
    signOut,
    /** Finds the card written on camera, links its dependent, and places it. */
    async afterWrittenCard() {
      const graph = await client.query(api.graph.getDeck, { deckId });
      const written = graph?.nodes.find((card) => card.front.trim() === WRITTEN_CARD.front);
      if (!written) throw new Error("The card written on camera was not saved.");
      ids.set(WRITTEN_CARD.key, written.id);
      await link(WRITTEN_LINKS);
      await place();
    },
    /**
     * Buries "What does a language model predict" until tomorrow, so the review
     * clip's queue holds only Tokens and Embeddings, whatever their order. The
     * graph does not show burying, so the card still reads as New there.
     */
    async beforeReview() {
      const result = await client.mutation(api.review.bury, {
        flashcardId: ids.get("next"),
        requestId: request("bury-next"),
      });
      if (result.status !== "ok") throw new Error(`Burying the next-token card failed.`);
    },
  };
}
