import { v } from "convex/values";
import { z } from "zod";

const id = z.string().min(1).max(100);
const key = z.string().min(1).max(120);
const requestId = z
  .string()
  .min(8)
  .max(120)
  .describe(
    "A unique operation ID. Reuse it only when retrying the identical request, within seven days.",
  );
const tags = z.array(z.string().max(60)).max(20);

const deck = z
  .object({
    key,
    name: z.string().trim().min(1).max(120),
    ankiName: z.string().max(500).optional(),
    cardCount: z.number().int().nonnegative().optional(),
  })
  .strict();

const warning = z
  .object({
    code: z.string().min(1).max(80),
    count: z.number().int().nonnegative(),
    message: z.string().min(1).max(1000),
  })
  .strict();

export const agentImportToolSchemas = {
  get_anki_import_guide: z.object({}).strict(),
  anki_import_status: z.object({ importId: id.optional() }).strict(),
  anki_import_preview: z.object({ importId: id }).strict(),
  anki_import_start: z
    .object({
      requestId,
      fileName: z.string().trim().min(1).max(255),
      sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
      kitVersion: z.string().min(1).max(20),
      decks: z.array(deck).min(1).max(200),
      planKeys: z.array(key).max(2000),
      totals: z
        .object({
          flashcards: z.number().int().nonnegative(),
          reviewUnits: z.number().int().nonnegative(),
          mediaFiles: z.number().int().nonnegative(),
        })
        .strict(),
      warnings: z.array(warning).max(100).optional(),
      unresolved: z
        .array(
          z
            .object({
              key,
              deckKey: key,
              reason: z.string().min(1).max(160),
              message: z.string().max(2000).optional(),
              notetypeName: z.string().max(500).optional(),
              cardCount: z.number().int().nonnegative().optional(),
            })
            .strict(),
        )
        .max(2000)
        .optional(),
    })
    .strict(),
  anki_import_add_batch: z
    .object({
      requestId,
      importId: id,
      cards: z
        .array(
          z
            .object({
              key,
              deckKey: key,
              type: z.string().min(1).max(40),
              content: z.unknown(),
              tags: tags.optional(),
              origin: z.enum(["converter", "repaired", "polished"]).optional(),
              source: z.unknown().optional(),
            })
            .strict(),
        )
        .max(100),
      skipped: z
        .array(z.object({ key, reason: z.string().trim().min(3).max(500) }).strict())
        .max(100)
        .optional(),
    })
    .strict(),
  anki_import_upload_token: z.object({ importId: id }).strict(),
  anki_import_finalize: z
    .object({
      requestId,
      importId: id,
      previewChecksum: z.string().regex(/^[a-f0-9]{64}$/),
      confirm: z.literal(true),
    })
    .strict(),
  anki_import_cancel: z
    .object({ requestId, importId: id, reason: z.string().trim().max(500).optional() })
    .strict(),
};

export const agentImportToolTitles = {
  get_anki_import_guide: "Get Anki converter kit",
  anki_import_status: "Read Anki import status",
  anki_import_preview: "Preview staged Anki import",
  anki_import_start: "Start Anki import",
  anki_import_add_batch: "Stage Anki cards",
  anki_import_upload_token: "Get Anki media upload token",
  anki_import_finalize: "Finalize Anki import",
  anki_import_cancel: "Cancel Anki import",
} as const;

export const agentImportToolDescriptions = {
  get_anki_import_guide:
    "Get the maintained, versioned Anki converter kit, its checksum, the scoped media-upload protocol, capability requirements, and the exact import steps. The current user must be able to give the assistant the file and run Node.js 20, 22, or 24 in its environment.",
  anki_import_status:
    "Read one staged Anki import, or the connection's latest import, including counts, progress, pending unresolved notes, and final deck links.",
  anki_import_preview:
    "Read the final staged manifest and approval checksum. Show the user counts, images, warnings, explicit skips, and any requested repairs before finalizing.",
  anki_import_start:
    "Start a fresh staged Anki import after running the converter kit. Declare the kit's decks, every plan key, totals, warnings, and unresolved notes. Returns a scoped media upload token and URL. Staged content stays invisible until finalization completes.",
  anki_import_add_batch:
    "Stage up to 100 converted or user-requested repaired cards (1,500 review items) with their media references, plus explicit skip reasons. The entire UTF-8 JSON request must stay under 1 MiB; send smaller batches for long content. Retry the identical request with the same requestId. Do not rewrite cards unless the user asked.",
  anki_import_upload_token:
    "Issue a fresh scoped upload token if the one from anki_import_start was lost or expired. It works only for this staging import's media endpoint.",
  anki_import_finalize:
    "Materialize a complete, user-approved staged import into new decks with fresh study progress. Requires the exact preview checksum and explicit confirmation. Incomplete or silently missing cards are rejected.",
  anki_import_cancel:
    "Cancel a staged or materializing Anki import and remove its cards, staging decks, and unshared uploaded images. Late uploads and batches are refused.",
} as const;

/** Component input schemas; Zod above enforces bounds and exact input at the write boundary. */
export const agentImportToolArgs = {
  get_anki_import_guide: {},
  anki_import_status: { importId: v.optional(v.string()) },
  anki_import_preview: { importId: v.string() },
  anki_import_start: {
    requestId: v.string(),
    fileName: v.string(),
    sourceSha256: v.string(),
    kitVersion: v.string(),
    decks: v.array(
      v.object({
        key: v.string(),
        name: v.string(),
        ankiName: v.optional(v.string()),
        cardCount: v.optional(v.number()),
      }),
    ),
    planKeys: v.array(v.string()),
    totals: v.object({ flashcards: v.number(), reviewUnits: v.number(), mediaFiles: v.number() }),
    warnings: v.optional(
      v.array(v.object({ code: v.string(), count: v.number(), message: v.string() })),
    ),
    unresolved: v.optional(
      v.array(
        v.object({
          key: v.string(),
          deckKey: v.string(),
          reason: v.string(),
          message: v.optional(v.string()),
          notetypeName: v.optional(v.string()),
          cardCount: v.optional(v.number()),
        }),
      ),
    ),
  },
  anki_import_add_batch: {
    requestId: v.string(),
    importId: v.string(),
    cards: v.array(
      v.object({
        key: v.string(),
        deckKey: v.string(),
        type: v.string(),
        content: v.any(),
        tags: v.optional(v.array(v.string())),
        origin: v.optional(
          v.union(v.literal("converter"), v.literal("repaired"), v.literal("polished")),
        ),
        source: v.optional(v.any()),
      }),
    ),
    skipped: v.optional(v.array(v.object({ key: v.string(), reason: v.string() }))),
  },
  anki_import_upload_token: { importId: v.string() },
  anki_import_finalize: {
    requestId: v.string(),
    importId: v.string(),
    previewChecksum: v.string(),
    confirm: v.literal(true),
  },
  anki_import_cancel: {
    requestId: v.string(),
    importId: v.string(),
    reason: v.optional(v.string()),
  },
};
