import { z } from "zod";

export const flashcardTypeSchema = z.enum(["basic", "cloze", "image-occlusion"]);
export type FlashcardType = z.infer<typeof flashcardTypeSchema>;

export const flashcardStateSchema = z.enum([
  "new",
  "learning",
  "review",
  "relearning",
  "suspended",
]);
export type FlashcardState = z.infer<typeof flashcardStateSchema>;

export const deckSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  cardCount: z.number(),
  dueCount: z.number(),
  newCount: z.number(),
});
export type Deck = z.infer<typeof deckSchema>;

export const basicContentSchema = z.object({
  type: z.literal("basic"),
  front: z.string(),
  back: z.string(),
});

export const clozeContentSchema = z.object({
  type: z.literal("cloze"),
  text: z.string(),
});

export const imageOcclusionContentSchema = z.object({
  type: z.literal("image-occlusion"),
  imageRef: z.string(),
  occlusions: z.array(
    z.object({ id: z.string(), label: z.string().optional() }),
  ),
});

export const flashcardContentSchema = z.discriminatedUnion("type", [
  basicContentSchema,
  clozeContentSchema,
  imageOcclusionContentSchema,
]);
export type FlashcardContent = z.infer<typeof flashcardContentSchema>;

export const flashcardSchema = z.object({
  id: z.string(),
  deckId: z.string(),
  content: flashcardContentSchema,
  tags: z.array(z.string()),
  state: flashcardStateSchema,
  dueAt: z.number().nullable(),
  createdAt: z.number(),
});
export type Flashcard = z.infer<typeof flashcardSchema>;

export const reviewRatingSchema = z.enum(["again", "hard", "good", "easy"]);
export type ReviewRating = z.infer<typeof reviewRatingSchema>;

export const reviewUnitSchema = z.object({
  id: z.string(),
  flashcardId: z.string(),
  deckId: z.string(),
  deckName: z.string(),
  content: flashcardContentSchema,
  state: flashcardStateSchema,
});
export type ReviewUnit = z.infer<typeof reviewUnitSchema>;

export const reviewQueueSchema = z.object({
  units: z.array(reviewUnitSchema),
  position: z.number(),
});
export type ReviewQueue = z.infer<typeof reviewQueueSchema>;

export const graphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  state: z.enum(["secured", "locked", "ready"]),
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  id: z.string(),
  prereqId: z.string(),
  dependentId: z.string(),
});
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const graphSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});
export type PrereqGraph = z.infer<typeof graphSchema>;

export const graphPlacementSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
});
export type GraphPlacement = z.infer<typeof graphPlacementSchema>;

export const graphLayoutSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      points: z.array(z.object({ x: z.number(), y: z.number() })),
    }),
  ),
});
export type GraphLayout = z.infer<typeof graphLayoutSchema>;

export const deckSettingsSchema = z.object({
  newCardsPerDay: z.number().nullable().optional(),
});
export type DeckSettings = z.infer<typeof deckSettingsSchema>;

export const reviewStateSnapshotSchema = z.object({
  state: flashcardStateSchema,
  dueAt: z.number().nullable(),
  stability: z.number(),
  difficulty: z.number(),
  elapsedDays: z.number(),
  scheduledDays: z.number(),
  learningSteps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  lastReviewAt: z.number().nullable(),
});
export type ReviewStateSnapshot = z.infer<typeof reviewStateSnapshotSchema>;

export const keybindingSchema = z.object({
  action: z.string(),
  keys: z.array(z.string()),
});
export type Keybinding = z.infer<typeof keybindingSchema>;

export const settingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  reviewQueueLimit: z.number(),
  newCardsPerDay: z.number(),
  keybindings: z.array(keybindingSchema),
});
export type Settings = z.infer<typeof settingsSchema>;

export const planSchema = z.enum(["free", "pro"]);
export type Plan = z.infer<typeof planSchema>;

export const subscriptionSchema = z.object({
  plan: planSchema,
  status: z.enum(["active", "canceled", "past_due", "none"]),
  aiAllowanceUsed: z.number(),
  aiAllowanceMonthly: z.number(),
  currentPeriodEnd: z.number().nullable(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const cramPoolSchema = z.object({
  deckIds: z.array(z.string()),
  combine: z.boolean(),
  tags: z.array(z.string()),
});
export type CramPool = z.infer<typeof cramPoolSchema>;
