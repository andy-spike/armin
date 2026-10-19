import type {
  Mutation,
  MutationResult,
  PullResponse,
  RecordData,
  RecordState,
  SyncRecord,
} from "@armin/sync-contract";
import { env } from "cloudflare:test";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { expect } from "vitest";
import app from "../src/index";
import { authOptions } from "../src/auth";

/** A second auth instance with helpers for creating signed-in Accounts. */
const testAuth = betterAuth({ ...authOptions(env), plugins: [testUtils()] });

let counter = 0;
export const newId = (prefix: string) =>
  `${prefix}-${++counter}-${crypto.randomUUID()}`;

export async function request(
  path: string,
  init: RequestInit & { json?: unknown } = {},
) {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("content-type", "application/json");
  return app.request(
    `http://localhost:8787${path}`,
    {
      ...rest,
      headers,
      body: json === undefined ? rest.body : JSON.stringify(json),
    },
    env,
  );
}

export type Client = Awaited<ReturnType<typeof signIn>>;

/** A device signed in to a fresh Account (or to `userId`'s Account). */
export async function signIn(userId?: string) {
  const ctx = await testAuth.$context;
  if (!userId) {
    const user = await ctx.test.saveUser(
      ctx.test.createUser({ email: `${newId("user")}@example.com` }),
    );
    userId = user.id;
  }
  const { headers, token } = await ctx.test.login({ userId });
  const cookie = headers.get("cookie")!;

  const send = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    request(`/v1${path}`, {
      ...init,
      headers: { ...Object.fromEntries(new Headers(init.headers)), cookie },
    });
  const json = async <T>(
    response: Response | Promise<Response>,
    status = 200,
  ) => {
    const res = await response;
    expect(res.status, await res.clone().text()).toBe(status);
    return (await res.json()) as T;
  };

  return {
    userId,
    token,
    cookie,
    send,
    json,
    async upload(records: SyncRecord[], uploadId = newId("upload")) {
      await json(
        send("/profile/upload", { method: "POST", json: { uploadId } }),
      );
      await json(
        send(`/profile/upload/${uploadId}/records`, {
          method: "PUT",
          json: { records },
        }),
      );
      return json<{ position: string }>(
        send(`/profile/upload/${uploadId}/complete`, { method: "POST" }),
      );
    },
    async push(...mutations: Mutation[]) {
      const { results } = await json<{ results: MutationResult[] }>(
        send("/changes", { method: "POST", json: { mutations } }),
      );
      return results;
    },
    async pullAll(after?: string, limit?: number) {
      const records: RecordState[] = [];
      let position = after;
      for (;;) {
        const query = new URLSearchParams();
        if (position) query.set("after", position);
        if (limit) query.set("limit", String(limit));
        const page = await json<PullResponse>(send(`/changes?${query}`));
        records.push(...page.records);
        position = page.position;
        if (!page.hasMore) return { records, position };
      }
    },
  };
}

// --- Profile fixtures ---

const now = Date.UTC(2026, 9, 1);

export const newProgress = (): RecordData["review_unit"]["progress"] => ({
  due: now,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  learningSteps: 0,
  reps: 0,
  lapses: 0,
  state: 0,
  lastReview: null,
});

export const settingsRecord = (
  overrides: Partial<RecordData["settings"]> = {},
): SyncRecord => ({
  kind: "settings",
  id: "profile",
  data: {
    requestRetention: 0.9,
    maximumInterval: 36500,
    enableFuzz: true,
    enableShortTerm: true,
    learningSteps: "10m",
    relearningSteps: "10m",
    weights: null,
    prereqStabilityFloor: 2,
    newReviewUnitsPerDay: 10,
    keepSiblingReviewUnitsTogether: true,
    schedulingPreset: "balanced",
    keybindings: null,
    updatedAt: now,
    ...overrides,
  },
});

export const deckData = (name = "Deck"): RecordData["deck"] => ({
  name,
  description: null,
  createdAt: now,
  updatedAt: now,
});

export const cardData = (
  deckId: string,
  front = "Front",
  content?: string,
): RecordData["flashcard"] => ({
  deckId,
  type: "basic",
  content: content ?? JSON.stringify({ front, back: "Back" }),
  tags: [],
  archived: false,
  createdAt: now,
  updatedAt: now,
});

export const unitData = (flashcardId: string): RecordData["review_unit"] => ({
  flashcardId,
  subKey: "",
  progress: newProgress(),
  createdAt: now,
});

/** A basic Flashcard with its single Review unit. */
export function card(deckId: string, front = "Front") {
  const id = newId("card");
  const unitId = newId("unit");
  return {
    id,
    unitId,
    records: [
      { kind: "flashcard", id, data: cardData(deckId, front) },
      { kind: "review_unit", id: unitId, data: unitData(id) },
    ] satisfies SyncRecord[],
  };
}

/** A Profile with one Deck holding two Flashcards, `a` a prerequisite of `b`. */
export function profile() {
  const deckId = newId("deck");
  const a = card(deckId, "A");
  const b = card(deckId, "B");
  const records: SyncRecord[] = [
    settingsRecord(),
    { kind: "deck", id: deckId, data: deckData() },
    ...a.records,
    ...b.records,
    {
      kind: "deck_graph",
      id: deckId,
      data: {
        edges: [{ prereqId: a.id, dependentId: b.id }],
        positions: { [a.id]: { x: 0, y: 0 }, [b.id]: { x: 0, y: 100 } },
      },
    },
  ];
  return { deckId, a, b, records };
}

export const reviewEntry = (review = now + 1000) => ({
  rating: 3,
  state: 1,
  due: review + 600_000,
  stability: 2.3,
  difficulty: 5,
  elapsedDays: 0,
  lastElapsedDays: 0,
  scheduledDays: 0,
  learningSteps: 1,
  review,
});

export const find = (records: RecordState[], kind: string, id: string) =>
  records.find((r) => r.kind === kind && r.id === id);
