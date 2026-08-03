import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  DeckSettings,
  FlashcardContent,
  GraphLayout,
  Keybinding,
  ReviewStateSnapshot,
} from "@/lib/shared/contracts";

const auth = pgSchema("auth");
const authUsers = auth.table("users", {
  id: uuid("id").primaryKey(),
});

export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  displayName: text("display_name").notNull().default(""),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const settings = pgTable("settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("system"),
  reviewQueueLimit: integer("review_queue_limit").notNull().default(100),
  newCardsPerDay: integer("new_cards_per_day").notNull().default(20),
  keybindings: jsonb("keybindings")
    .$type<Keybinding[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const decks = pgTable(
  "decks",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    settings: jsonb("settings")
      .$type<DeckSettings>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("decks_user_idx").on(table.userId)],
);

export const graphLayouts = pgTable("graph_layouts", {
  deckId: text("deck_id")
    .primaryKey()
    .references(() => decks.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  layout: jsonb("layout")
    .$type<GraphLayout>()
    .notNull()
    .default(sql`'{"nodes":[],"edges":[]}'::jsonb`),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const flashcards = pgTable(
  "flashcards",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    content: jsonb("content").$type<FlashcardContent>().notNull(),
    tags: jsonb("tags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    archived: boolean("archived").notNull().default(false),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("flashcards_user_deck_idx").on(table.userId, table.deckId),
  ],
);

export const reviewUnits = pgTable(
  "review_units",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    flashcardId: text("flashcard_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    subKey: text("sub_key").notNull(),
    position: integer("position").notNull().default(0),
    state: text("state").notNull().default("new"),
    dueAt: bigint("due_at", { mode: "number" }),
    stability: doublePrecision("stability").notNull().default(0),
    difficulty: doublePrecision("difficulty").notNull().default(0),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    lastReviewAt: bigint("last_review_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("review_units_flashcard_sub_key_unique_idx").on(
      table.flashcardId,
      table.subKey,
    ),
    index("review_units_user_due_idx").on(table.userId, table.dueAt),
    index("review_units_user_state_idx").on(table.userId, table.state),
  ],
);

export const reviewLogs = pgTable(
  "review_logs",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewUnitId: text("review_unit_id")
      .notNull()
      .references(() => reviewUnits.id, { onDelete: "cascade" }),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    rating: text("rating").notNull(),
    stateBefore: jsonb("state_before")
      .$type<ReviewStateSnapshot>()
      .notNull(),
    reviewedAt: bigint("reviewed_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("review_logs_user_review_unit_idx").on(
      table.userId,
      table.reviewUnitId,
      table.reviewedAt,
    ),
  ],
);

export const prerequisiteEdges = pgTable(
  "prerequisite_edges",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    prereqId: text("prereq_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    dependentId: text("dependent_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("prerequisite_edges_unique_idx").on(
      table.deckId,
      table.prereqId,
      table.dependentId,
    ),
    index("prerequisite_edges_dependent_idx").on(
      table.deckId,
      table.dependentId,
    ),
  ],
);

export const media = pgTable(
  "media",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    storageRef: text("storage_ref").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("media_user_idx").on(table.userId)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plan: text("plan").notNull().default("free"),
    status: text("status").notNull().default("none"),
    polarCustomerId: text("polar_customer_id"),
    polarSubscriptionId: text("polar_subscription_id"),
    currentPeriodEnd: bigint("current_period_end", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("subscriptions_user_idx").on(table.userId),
    uniqueIndex("subscriptions_user_unique_idx").on(table.userId),
    uniqueIndex("subscriptions_polar_sub_idx").on(table.polarSubscriptionId),
  ],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    creditsUsed: integer("credits_used").notNull().default(0),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("ai_usage_user_month_idx").on(table.userId, table.month),
  ],
);

export type User = typeof users.$inferSelect;
export type Deck = typeof decks.$inferSelect;
export type Flashcard = typeof flashcards.$inferSelect;
export type ReviewLog = typeof reviewLogs.$inferSelect;
export type PrerequisiteEdge = typeof prerequisiteEdges.$inferSelect;
export type Media = typeof media.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;
