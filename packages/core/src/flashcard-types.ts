import { z } from "zod";
import {
  clozeClusters,
  hasEmptyClozeDeletion,
  normalizeClozeText,
} from "./flashcard-rules";

export * from "./flashcard-rules";

/**
 * Flashcard-type domain module.
 *
 * A "flashcard" is the authored unit; it carries a `type` and a type-specific
 * `content` object. Each flashcard generates one or more review units (rows in
 * the `review_units` table), keyed by a stable `subKey` so edits preserve FSRS
 * history for the parts that did not change.
 *
 * The content schemas depend on `zod`; the rules that don't need them live in
 * `flashcard-rules` and are re-exported here.
 */

export const FLASHCARD_TYPES = [
  "basic",
  "basic_reversed",
  "cloze",
  "type_answer",
  "image_occlusion",
] as const;

export type FlashcardType = (typeof FLASHCARD_TYPES)[number];

export function isFlashcardType(value: string): value is FlashcardType {
  return (FLASHCARD_TYPES as readonly string[]).includes(value);
}

// --- Per-type content schemas ---

export const basicContentSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
});

const clozeContentSchema = z
  .object({ text: z.string().min(1) })
  .refine((c) => clozeClusters(c.text).length > 0, {
    message: "Cloze text must contain at least one {{…}} deletion.",
    path: ["text"],
  })
  .refine((c) => !hasEmptyClozeDeletion(c.text), {
    message: "Every cloze deletion needs an answer.",
    path: ["text"],
  });

const typeAnswerContentSchema = z.object({
  prompt: z.string().min(1),
  answer: z.string().min(1),
  acceptedAnswers: z.array(z.string()).default([]),
});

const imageOcclusionGeometrySchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const imageOcclusionMaskSchema = z.object({
  id: z.string().min(1),
  geometry: imageOcclusionGeometrySchema,
  label: z.string().min(1).optional(),
  hint: z.string().optional(),
});

const imageOcclusionContentSchema = z.object({
  baseImage: z.string().min(1),
  masks: z.array(imageOcclusionMaskSchema).min(1),
  header: z.string().optional(),
  extra: z.string().optional(),
  revealMode: z.enum(["hide_all", "hide_one"]).default("hide_all"),
});

export type BasicContent = z.infer<typeof basicContentSchema>;
export type ClozeContent = z.infer<typeof clozeContentSchema>;
export type TypeAnswerContent = z.infer<typeof typeAnswerContentSchema>;
export type ImageOcclusionGeometry = z.infer<
  typeof imageOcclusionGeometrySchema
>;
export type ImageOcclusionMask = z.infer<typeof imageOcclusionMaskSchema>;
export type ImageOcclusionContent = z.infer<typeof imageOcclusionContentSchema>;

export type FlashcardContentByType = {
  basic: BasicContent;
  basic_reversed: BasicContent;
  cloze: ClozeContent;
  type_answer: TypeAnswerContent;
  image_occlusion: ImageOcclusionContent;
};

export type FlashcardContent = FlashcardContentByType[FlashcardType];

const contentSchemaByType = {
  basic: basicContentSchema,
  basic_reversed: basicContentSchema,
  cloze: clozeContentSchema,
  type_answer: typeAnswerContentSchema,
  image_occlusion: imageOcclusionContentSchema,
} as const;

/**
 * Stored rows are read with the rules they were written under. Empty cloze
 * deletions created before validation existed must stay readable so the owner
 * can open and repair them; new writes still go through the strict schema.
 */
const storedContentSchemaByType = {
  ...contentSchemaByType,
  cloze: z
    .object({ text: z.string().min(1) })
    .refine((c) => clozeClusters(c.text).length > 0, {
      message: "Cloze text must contain at least one {{…}} deletion.",
      path: ["text"],
    }),
} as const;

function normalizeContent<T extends FlashcardType>(
  type: T,
  content: FlashcardContentByType[T],
): FlashcardContentByType[T] {
  if (type !== "cloze") return content;
  const cloze = content as ClozeContent;
  return {
    ...cloze,
    text: normalizeClozeText(cloze.text),
  } as FlashcardContentByType[T];
}

/** Validate and normalize a content object for the given type. */
export function validateContent<T extends FlashcardType>(
  type: T,
  content: unknown,
): FlashcardContentByType[T] {
  return normalizeContent(
    type,
    contentSchemaByType[type].parse(content) as FlashcardContentByType[T],
  );
}

/** Parse a stored JSON content string into a validated content object. */
export function parseStoredContent(
  type: string,
  raw: string,
): { type: FlashcardType; content: FlashcardContent } {
  if (!isFlashcardType(type)) {
    throw new Error(`Unknown flashcard type: ${type}`);
  }
  const parsed = JSON.parse(raw) as unknown;
  const content = storedContentSchemaByType[type].parse(
    parsed,
  ) as FlashcardContent;
  if (type === "cloze") {
    return {
      type,
      content: {
        ...content,
        text: normalizeClozeText((content as ClozeContent).text),
      },
    };
  }
  return { type, content };
}

export function serializeContent(content: FlashcardContent): string {
  return JSON.stringify(content);
}
