"use node";

import { strToU8, zipSync, type Zippable } from "fflate";
import { v } from "convex/values";
import { parseStoredContent } from "@armin/core/flashcard-types";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { MAX_EXPORT_BYTES } from "./model/limits";

const FORMAT = "armin-library-export";
const FORMAT_VERSION = 1;
const MAX_ATTEMPTS = 3;

const iso = (ms: number | null | undefined) =>
  ms == null ? null : new Date(ms).toISOString();

const README = `# Armin library export

This archive contains one Armin account's study library.

- \`manifest.json\` — format, version, export time, library revision, counts,
  and a SHA-256 checksum for every other file.
- \`data/decks.json\` — decks.
- \`data/flashcards.json\` — authored flashcards with type, content, tags,
  archive and lock state, and graph canvas positions.
- \`data/review-units.json\` — generated review units with their FSRS schedule.
- \`data/review-logs.json\` — every review, oldest first.
- \`data/prerequisites.json\` — prerequisite edges (prerequisite → dependent).
- \`data/settings.json\` — account time zone, study settings, deck overrides.
- \`media/\` — images referenced by flashcards as \`armin-media:<file>\`.

Timestamps are ISO 8601 UTC. No passwords, sessions, or sign-in data are
included. Restoring an export is not supported yet.
`;

type Snapshot = {
  revision: number;
  decks: Doc<"decks">[];
  flashcards: Doc<"flashcards">[];
  reviewUnits: Doc<"reviewUnits">[];
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

/**
 * Build a versioned ZIP of one library. The non-history snapshot is a single
 * consistent query; review history is paged. The library revision is checked
 * before and after collection and the export retries if the library changed
 * meanwhile, so the archive is internally consistent.
 */
export const build = internalAction({
  args: { exportId: v.id("exports") },
  handler: async (ctx, { exportId }) => {
    try {
      const job = await ctx.runQuery(internal.exports.jobLibrary, { exportId });
      if (!job) return;

      let snapshot: Snapshot | null = null;
      let logs: Doc<"reviewLogs">[] = [];
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !snapshot; attempt++) {
        const core = (await ctx.runQuery(internal.exports.snapshotCore, {
          libraryId: job.libraryId,
        })) as Snapshot;
        const pages: Doc<"reviewLogs">[] = [];
        let cursor: string | null = null;
        for (;;) {
          const page: { page: Doc<"reviewLogs">[]; isDone: boolean; continueCursor: string } =
            await ctx.runQuery(internal.exports.logPage, {
              libraryId: job.libraryId,
              cursor,
            });
          pages.push(...page.page);
          if (page.isDone) break;
          cursor = page.continueCursor;
        }
        const after = await ctx.runQuery(internal.exports.revision, {
          libraryId: job.libraryId,
        });
        if (after === core.revision) {
          snapshot = core;
          // History of a just-deleted deck may still be awaiting cleanup.
          const unitIds = new Set<string>(core.reviewUnits.map((unit) => unit._id));
          const currentDeck = new Map(core.reviewUnits.map(unit => [unit._id, unit.deckId]));
          logs = pages.filter((log) => unitIds.has(log.reviewUnitId))
            .map(log => ({ ...log, deckId: currentDeck.get(log.reviewUnitId)! }));
        }
      }
      if (!snapshot) {
        throw new Error("The library kept changing during export. Try again.");
      }

      const files: Record<string, Uint8Array> = {};
      const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2));

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
      const { libraryId, updatedAt, _id, _creationTime, ...settings } = snapshot.settings as Snapshot["settings"] & { _id?: string; _creationTime?: number };
      files["data/settings.json"] = json({
        timeZone: job.timeZone,
        study: { ...settings, updatedAt: iso(updatedAt) },
        deckOverrides: snapshot.deckSettings.map(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ({ _id, _creationTime, libraryId, updatedAt: deckUpdated, ...rest }) => ({
            ...rest,
            updatedAt: iso(deckUpdated),
          }),
        ),
      });
      for (const media of snapshot.media) {
        const blob = await ctx.storage.get(media.storageId);
        if (!blob) throw new Error(`Image ${media.fileName} is missing from storage.`);
        files[`media/${media.fileName}`] = new Uint8Array(await blob.arrayBuffer());
      }
      files["README.md"] = strToU8(README);

      const checksums: Record<string, string> = {};
      for (const [path, bytes] of Object.entries(files)) {
        const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
        checksums[path] = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      }
      const manifest = {
        format: FORMAT,
        version: FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        libraryRevision: snapshot.revision,
        libraryCreatedAt: iso(job.createdAt),
        counts: {
          decks: snapshot.decks.length,
          flashcards: snapshot.flashcards.length,
          reviewUnits: snapshot.reviewUnits.length,
          reviewLogs: logs.length,
          prerequisites: snapshot.prereqs.length,
          media: snapshot.media.length,
        },
        checksums,
      };

      const zippable: Zippable = { "manifest.json": json(manifest) };
      for (const [path, bytes] of Object.entries(files)) {
        // Images are already compressed; store them as-is.
        zippable[path] = path.startsWith("media/") ? [bytes, { level: 0 }] : bytes;
      }
      const zip = zipSync(zippable, { level: 6 });
      if (zip.byteLength > MAX_EXPORT_BYTES) {
        throw new Error("This library is too large to export in one file during the beta.");
      }
      const storageId = await ctx.storage.store(
        new Blob([zip], { type: "application/zip" }),
      );
      await ctx.runMutation(internal.exports.markResult, {
        exportId,
        storageId,
        size: zip.byteLength,
      });
    } catch (error) {
      await ctx.runMutation(internal.exports.markResult, {
        exportId,
        error: error instanceof Error ? error.message : "Export failed.",
      });
    }
  },
});
