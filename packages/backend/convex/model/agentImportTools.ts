import { v } from "convex/values";
import { z } from "zod";
import type { AgentScope } from "./agentAuth";
import { MAX_TAG_CHARS, MAX_TAGS_PER_FLASHCARD } from "./limits";

const id = z.string().min(1).max(100);
const key = z.string().min(1).max(120);
const requestId = z
  .string()
  .min(8)
  .max(120)
  .describe(
    "A unique operation ID. Reuse it only when retrying the identical request, within seven days.",
  );
const tags = z
  .array(z.string().max(MAX_TAG_CHARS))
  .max(MAX_TAGS_PER_FLASHCARD)
  .describe(
    `Up to ${MAX_TAGS_PER_FLASHCARD} tags, each at most ${MAX_TAG_CHARS} characters. Hierarchical tags use ::, such as biology::cells.`,
  );

const deck = z
  .object({
    key: key.describe("Deck key from the converter plan."),
    name: z.string().trim().min(1).max(120).describe("Deck name."),
    ankiName: z.string().max(500).optional().describe("Original Anki deck name."),
    cardCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Cards from this deck in the plan."),
  })
  .strict();

const warning = z
  .object({
    code: z.string().min(1).max(80).describe("Short warning code."),
    count: z.number().int().nonnegative().describe("Number of affected notes."),
    message: z.string().min(1).max(1000).describe("Human-readable warning."),
  })
  .strict();

export const agentImportToolSchemas = {
  get_guide: z
    .object({
      topic: z
        .enum(["authoring", "anki_import"])
        .describe("authoring before writing cards; anki_import before converting an Anki file."),
    })
    .strict(),
  anki_import_status: z
    .object({
      importId: id
        .optional()
        .describe("Import ID from anki_import_start; omit for the latest import."),
      includePreview: z
        .boolean()
        .optional()
        .describe(
          "Set true before finalizing to get the manifest and approval checksum to show the user.",
        ),
    })
    .strict(),
  anki_import_start: z
    .object({
      requestId,
      fileName: z.string().trim().min(1).max(255).describe("Original Anki file name."),
      sourceSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .describe("SHA-256 of the source file, lowercase hex."),
      kitVersion: z.string().min(1).max(20).describe("Converter kit version from get_guide."),
      decks: z.array(deck).min(1).max(200).describe("Decks declared in the converter plan."),
      planKeys: z.array(key).max(2000).describe("Every card and deck key in the converter plan."),
      totals: z
        .object({
          flashcards: z.number().int().nonnegative().describe("Total flashcards in the plan."),
          reviewUnits: z.number().int().nonnegative().describe("Total review units in the plan."),
          mediaFiles: z.number().int().nonnegative().describe("Total media files in the plan."),
        })
        .strict()
        .describe("Totals from the converter plan."),
      warnings: z.array(warning).max(100).optional().describe("Warnings from the converter plan."),
      unresolved: z
        .array(
          z
            .object({
              key: key.describe("Plan key of the unresolved note."),
              deckKey: key.describe("Deck key that contains the note."),
              reason: z
                .string()
                .min(1)
                .max(160)
                .describe("Short reason the note could not be converted."),
              message: z.string().max(2000).optional().describe("Details for the user."),
              notetypeName: z.string().max(500).optional().describe("Original Anki notetype."),
              cardCount: z.number().int().nonnegative().optional().describe("Cards in the note."),
            })
            .strict(),
        )
        .max(2000)
        .optional()
        .describe("Plan entries that could not be converted."),
    })
    .strict(),
  anki_import_add_batch: z
    .object({
      requestId,
      importId: id.describe("Import ID from anki_import_start."),
      cards: z
        .array(
          z
            .object({
              key: key.describe("Card key from the converter plan."),
              deckKey: key.describe("Deck key from anki_import_start."),
              type: z
                .string()
                .min(1)
                .max(40)
                .describe("Card type, such as basic, basic_reversed, cloze, or type_answer."),
              content: z.unknown().describe("Card content matching type."),
              tags: tags.optional(),
              origin: z
                .enum(["converter", "repaired", "polished"])
                .optional()
                .describe("Where the card came from: converter, repaired, or polished."),
              source: z.unknown().optional().describe("Converter source details for provenance."),
            })
            .strict(),
        )
        .max(100)
        .describe("Converted cards, at most 100 per call."),
      skipped: z
        .array(
          z
            .object({
              key: key.describe("Plan key being skipped."),
              reason: z.string().trim().min(3).max(500).describe("Why the user agreed to skip it."),
            })
            .strict(),
        )
        .max(100)
        .optional()
        .describe("Plan entries the user agreed to skip."),
    })
    .strict(),
  anki_import_upload_token: z
    .object({ importId: id.describe("Import ID from anki_import_start.") })
    .strict(),
  anki_import_finalize: z
    .object({
      requestId,
      importId: id.describe("Import ID from anki_import_start."),
      previewChecksum: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .describe("previewChecksum from anki_import_status with includePreview: true."),
      confirm: z
        .literal(true)
        .describe("Must be true, only after the user explicitly approves the preview."),
    })
    .strict(),
  anki_import_cancel: z
    .object({
      requestId,
      importId: id.describe("Import ID from anki_import_start."),
      reason: z.string().trim().max(500).optional().describe("Why the import is being cancelled."),
    })
    .strict(),
};

export type AgentImportToolName = keyof typeof agentImportToolSchemas;

export const agentImportToolScopes: Record<AgentImportToolName, AgentScope> = {
  get_guide: "armin:read",
  anki_import_status: "armin:read",
  anki_import_start: "armin:import",
  anki_import_add_batch: "armin:import",
  anki_import_upload_token: "armin:import",
  anki_import_finalize: "armin:import",
  anki_import_cancel: "armin:import",
};

export const agentImportToolTitles = {
  get_guide: "Get guide",
  anki_import_status: "Read Anki import status",
  anki_import_start: "Start Anki import",
  anki_import_add_batch: "Stage Anki cards",
  anki_import_upload_token: "Get Anki media upload token",
  anki_import_finalize: "Finalize Anki import",
  anki_import_cancel: "Cancel Anki import",
} as const;

export const agentImportToolDescriptions = {
  get_guide:
    "Return Armin's guidance for a topic: writing and editing cards, or converting and staging an Anki file. Read the matching guide before starting that work.",
  anki_import_status:
    "Read one staged Anki import, or the connection's latest import, including counts, progress, pending unresolved notes, and final deck links. Set includePreview true before finalizing to get the final manifest and approval checksum.",
  anki_import_start:
    "Start a staged Anki import from the converter kit's decks, every plan key, totals, warnings, and unresolved notes. Returns a scoped media upload token; staged content stays invisible until finalization completes.",
  anki_import_add_batch:
    "Stage up to 100 converted or user-requested repaired cards (1,500 review items) with their media references, plus explicit skip reasons. Keep the entire UTF-8 JSON request under 1 MiB and send smaller batches for long content; retry an identical request with the same requestId. Do not rewrite cards unless the user asked.",
  anki_import_upload_token:
    "Issue a fresh scoped upload token if the one from anki_import_start was lost or expired. It works only for this staging import's media endpoint.",
  anki_import_finalize:
    "Materialize a complete, user-approved staged import into new decks with fresh study progress. Requires the exact checksum from anki_import_status with includePreview: true and explicit confirmation. Incomplete or silently missing cards are rejected.",
  anki_import_cancel:
    "Cancel a staged or materializing Anki import and remove its cards, staging decks, and unshared uploaded images. Late uploads and batches are refused.",
} as const;

export const agentImportToolArgs = {
  get_guide: { topic: v.union(v.literal("authoring"), v.literal("anki_import")) },
  anki_import_status: { importId: v.optional(v.string()), includePreview: v.optional(v.boolean()) },
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

export const agentGuideReturns = v.union(
  v.object({ guide: v.string() }),
  v.object({
    kit: v.object({
      version: v.string(),
      downloadUrl: v.string(),
      sha256: v.string(),
      bytes: v.number(),
      runtime: v.string(),
      testedRuntime: v.string(),
      command: v.string(),
    }),
    requirements: v.string(),
    upload: v.object({
      method: v.string(),
      urlTemplate: v.string(),
      authorization: v.string(),
      contentType: v.string(),
      maxBytes: v.number(),
      supported: v.string(),
      note: v.string(),
    }),
    rules: v.array(v.string()),
    flow: v.array(v.string()),
    limits: v.object({
      libraryDecks: v.number(),
      libraryFlashcards: v.number(),
      libraryReviewUnits: v.number(),
      maxMediaBytes: v.number(),
      batchCards: v.number(),
      batchReviewUnits: v.number(),
      stagingHours: v.number(),
    }),
  }),
);
