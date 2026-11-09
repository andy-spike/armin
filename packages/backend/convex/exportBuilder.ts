"use node";

import { strToU8, zipSync, type Zippable } from "fflate";
import { v } from "convex/values";
import { parseStoredContent } from "@armin/core/flashcard-types";
import { isAudioFile } from "@armin/core/media";
import { internal } from "./_generated/api";
import type { FunctionReturnType } from "convex/server";
import { internalAction, type ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { MAX_EXPORT_BYTES } from "./model/limits";

const FORMAT = "armin-library-export";
const FORMAT_VERSION = 1;
const MAX_ATTEMPTS = 3;

const iso = (ms: number | null | undefined) => (ms == null ? null : new Date(ms).toISOString());

const README = `# Armin library export

This archive contains one Armin account's study library.

- \`manifest.json\` — format, version, export time, library revision, counts,
  and a SHA-256 checksum for every other file.
- \`data/decks.json\` — decks.
- \`data/flashcards.json\` — authored flashcards with type, content, tags,
  archive and lock state, permanent prerequisite access, and graph canvas positions.
- \`data/review-units.json\` — generated review units with their FSRS schedule.
- \`data/concept-variants.json\` — every exercise variant of each concept card,
  with its status (active or flagged) and when a review last showed it. The
  card's template is its content in \`data/flashcards.json\`.
- \`data/review-logs.json\` — every review, oldest first.
- \`data/prerequisites.json\` — prerequisite edges (prerequisite → dependent).
- \`data/settings.json\` — account time zone, study settings, deck overrides.
- \`media/\` — images and audio referenced by flashcards as \`armin-media:<file>\`
  (audio is left out when the export was made without it).

Timestamps are ISO 8601 UTC. No passwords, sessions, or sign-in data are
included. Restoring an export is not supported yet.
`;

type Snapshot = {
  revision: number;
  decks: Doc<"decks">[];
  flashcards: Doc<"flashcards">[];
  reviewUnits: Doc<"reviewUnits">[];
  variants: Doc<"conceptVariants">[];
  prereqs: Doc<"prereqs">[];
  deckSettings: Doc<"deckSettings">[];
  media: Doc<"media">[];
  settings: Omit<Doc<"settings">, "_id" | "_creationTime">;
};

function fsrs(row: Doc<"reviewUnits">) {
  return {
    state: row.state,
    due: iso(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsedDays,
    scheduledDays: row.scheduledDays,
    learningSteps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    lastReview: iso(row.lastReview),
  };
}

type Page<T> = { page: T[]; isDone: boolean; continueCursor: string };
type ExportJob = NonNullable<FunctionReturnType<typeof internal.exports.jobLibrary>>;

async function collectPages<T>(load: (cursor: string | null) => Promise<Page<T>>) {
  const rows: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await load(cursor);
    rows.push(...page.page);
    if (page.isDone) return rows;
    cursor = page.continueCursor;
  }
}

const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2));

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function collectSnapshot(ctx: ActionCtx, libraryId: Id<"libraries">) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const meta = await ctx.runQuery(internal.exports.snapshotCore, { libraryId });
    const core: Snapshot = {
      ...(meta as Omit<Snapshot, "flashcards" | "reviewUnits" | "variants" | "prereqs">),
      flashcards: [],
      reviewUnits: [],
      variants: [],
      prereqs: [],
    };
    for (const deck of meta.decks) {
      for (const table of ["flashcards", "reviewUnits", "prereqs"] as const) {
        const rows = await collectPages(
          (cursor) =>
            ctx.runQuery(internal.exports.deckPage, {
              deckId: deck._id,
              table,
              cursor,
            }) as Promise<Page<unknown>>,
        );
        (core[table] as unknown[]).push(...rows);
      }
    }
    const variants = await collectPages(
      (cursor) =>
        ctx.runQuery(internal.exports.variantPage, { libraryId, cursor }) as Promise<
          Page<Doc<"conceptVariants">>
        >,
    );
    const pages = await collectPages(
      (cursor) =>
        ctx.runQuery(internal.exports.logPage, { libraryId, cursor }) as Promise<
          Page<Doc<"reviewLogs">>
        >,
    );
    const after = await ctx.runQuery(internal.exports.revision, { libraryId });
    if (after !== core.revision) continue;
    const unitIds = new Set<string>(core.reviewUnits.map((unit) => unit._id));
    const currentDeck = new Map(core.reviewUnits.map((unit) => [unit._id, unit.deckId]));
    const cardIds = new Set<string>(core.flashcards.map((card) => card._id));
    core.variants = variants.filter((variant) => cardIds.has(variant.flashcardId));
    const logs = pages
      .filter((log) => unitIds.has(log.reviewUnitId))
      .map((log) => ({ ...log, deckId: currentDeck.get(log.reviewUnitId)! }));
    return { snapshot: core, logs };
  }
  return null;
}

function dataFiles(snapshot: Snapshot, logs: Doc<"reviewLogs">[], timeZone: string) {
  const files: Record<string, Uint8Array> = {};

  files["data/decks.json"] = json(
    snapshot.decks.map((deck) => ({
      id: deck._id,
      name: deck.name,
      description: deck.description,
      createdAt: iso(deck.createdAt),
      updatedAt: iso(deck.updatedAt),
    })),
  );
  files["data/flashcards.json"] = json(
    snapshot.flashcards.map((flashcard) => {
      const { type, content } = parseStoredContent(flashcard.type, flashcard.content);
      return {
        id: flashcard._id,
        deckId: flashcard.deckId,
        type,
        content,
        tags: flashcard.tags,
        archived: flashcard.archived,
        locked: flashcard.locked,
        prerequisiteAccessGranted: flashcard.prerequisiteAccessGranted,
        position:
          flashcard.posX == null || flashcard.posY == null
            ? null
            : { x: flashcard.posX, y: flashcard.posY },
        createdAt: iso(flashcard.createdAt),
        updatedAt: iso(flashcard.updatedAt),
      };
    }),
  );
  files["data/review-units.json"] = json(
    snapshot.reviewUnits.map((unit) => ({
      id: unit._id,
      flashcardId: unit.flashcardId,
      deckId: unit.deckId,
      subKey: unit.subKey,
      front: unit.front,
      back: unit.back,
      locked: unit.locked,
      archived: unit.archived,
      schedule: fsrs(unit),
    })),
  );
  files["data/concept-variants.json"] = json(
    snapshot.variants.map((variant) => ({
      id: variant._id,
      flashcardId: variant.flashcardId,
      exercise: variant.exercise,
      solution: variant.solution,
      status: variant.status,
      origin: variant.origin,
      lastShownAt: iso(variant.lastShownAt),
      createdAt: iso(variant.createdAt),
      updatedAt: iso(variant.updatedAt),
    })),
  );
  files["data/review-logs.json"] = json(
    logs.map((log) => ({
      id: log._id,
      reviewUnitId: log.reviewUnitId,
      flashcardId: log.flashcardId,
      deckId: log.deckId,
      rating: log.rating,
      state: log.state,
      due: iso(log.due),
      stability: log.stability,
      difficulty: log.difficulty,
      elapsedDays: log.elapsedDays,
      lastElapsedDays: log.lastElapsedDays,
      scheduledDays: log.scheduledDays,
      learningSteps: log.learningSteps,
      review: iso(log.review),
    })),
  );
  files["data/prerequisites.json"] = json(
    snapshot.prereqs.map((edge) => ({
      deckId: edge.deckId,
      prerequisiteId: edge.prereqId,
      dependentId: edge.dependentId,
    })),
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { libraryId, updatedAt, _id, _creationTime, ...settings } =
    snapshot.settings as Snapshot["settings"] & { _id?: string; _creationTime?: number };
  files["data/settings.json"] = json({
    timeZone,
    study: { ...settings, updatedAt: iso(updatedAt) },
    deckOverrides: snapshot.deckSettings.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ _id, _creationTime, libraryId, updatedAt: deckUpdated, ...rest }) => ({
        ...rest,
        updatedAt: iso(deckUpdated),
      }),
    ),
  });
  files["README.md"] = strToU8(README);
  return files;
}

async function buildManifest(
  job: ExportJob,
  snapshot: Snapshot,
  logs: Doc<"reviewLogs">[],
  files: Record<string, Uint8Array>,
  media: Doc<"media">[],
) {
  const checksums: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(files)) checksums[path] = await sha256Hex(bytes);
  for (const row of media) checksums[`media/${row.fileName}`] = row.fileName.split(".")[0];
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    libraryRevision: snapshot.revision,
    libraryCreatedAt: iso(job.createdAt),
    counts: {
      decks: snapshot.decks.length,
      flashcards: snapshot.flashcards.length,
      reviewUnits: snapshot.reviewUnits.length,
      conceptVariants: snapshot.variants.length,
      reviewLogs: logs.length,
      prerequisites: snapshot.prereqs.length,
      media: media.length,
    },
    checksums,
  };
}

export const build = internalAction({
  args: { exportId: v.id("exports") },
  handler: async (ctx, { exportId }) => {
    try {
      const job = await ctx.runQuery(internal.exports.jobLibrary, { exportId });
      if (!job) return;
      const collected = await collectSnapshot(ctx, job.libraryId);
      if (!collected) throw new Error("The library kept changing during export. Try again.");
      const { snapshot, logs } = collected;
      const files = dataFiles(snapshot, logs, job.timeZone);
      const media = snapshot.media.filter((row) => job.includeAudio || !isAudioFile(row.fileName));
      const manifest = await buildManifest(job, snapshot, logs, files, media);

      const zippable: Zippable = { "manifest.json": json(manifest), ...files };
      const zip = zipSync(zippable, { level: 6 });
      if (zip.byteLength > MAX_EXPORT_BYTES) {
        throw new Error("This library's card data is too large to export during the beta.");
      }
      const storageId = await ctx.storage.store(new Blob([zip], { type: "application/zip" }));
      await ctx.runMutation(internal.exports.markResult, {
        exportId,
        storageId,
        size: zip.byteLength + media.reduce((sum, row) => sum + row.size, 0),
      });
    } catch (error) {
      await ctx.runMutation(internal.exports.markResult, {
        exportId,
        error: error instanceof Error ? error.message : "Export failed.",
      });
    }
  },
});
