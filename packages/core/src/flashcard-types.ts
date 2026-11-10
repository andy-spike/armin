import { z } from "zod";
import { hasMediaReference, MAX_VARIANT_FIELD_CHARS } from "./concept";
import { clozeClusters, hasEmptyClozeDeletion, normalizeClozeText } from "./flashcard-rules";

export * from "./flashcard-rules";

export const FLASHCARD_TYPES = [
  "basic",
  "basic_reversed",
  "cloze",
  "type_answer",
  "image_occlusion",
  "concept",
] as const;

export type FlashcardType = (typeof FLASHCARD_TYPES)[number];

export function isFlashcardType(value: string): value is FlashcardType {
  return (FLASHCARD_TYPES as readonly string[]).includes(value);
}

export const basicContentSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
});

const optionalMarkdownSchema = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value : undefined));

const clozeContentSchema = z
  .object({ text: z.string().min(1), extra: optionalMarkdownSchema })
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
  parts: z.array(imageOcclusionGeometrySchema).min(2).max(32).optional(),
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

function conceptText(label: string, max?: number) {
  const text = z
    .string()
    .refine((value) => value.trim().length > 0, { message: `${label} is required.` })
    .refine((value) => !hasMediaReference(value), {
      message: `${label} can't contain images or audio. Use text and equations.`,
    });
  return max
    ? text.refine((value) => value.length <= max, {
        message: `${label} is limited to ${max} characters.`,
      })
    : text;
}

const conceptContentSchema = z.object({
  brief: conceptText("The brief"),
  example: z.object({
    exercise: conceptText("The example exercise"),
    solution: conceptText("The example solution"),
  }),
});

export const conceptVariantSchema = z.object({
  exercise: conceptText("A variant's exercise", MAX_VARIANT_FIELD_CHARS),
  solution: conceptText("A variant's solution", MAX_VARIANT_FIELD_CHARS),
});

export type BasicContent = z.infer<typeof basicContentSchema>;
export type ClozeContent = { text: string; extra?: string };
export type TypeAnswerContent = z.infer<typeof typeAnswerContentSchema>;
export type ImageOcclusionGeometry = z.infer<typeof imageOcclusionGeometrySchema>;
export type ImageOcclusionMask = z.infer<typeof imageOcclusionMaskSchema>;
export type ImageOcclusionContent = z.infer<typeof imageOcclusionContentSchema>;
export type ConceptContent = z.infer<typeof conceptContentSchema>;
export type ConceptVariant = z.infer<typeof conceptVariantSchema>;

export type FlashcardContentByType = {
  basic: BasicContent;
  basic_reversed: BasicContent;
  cloze: ClozeContent;
  type_answer: TypeAnswerContent;
  image_occlusion: ImageOcclusionContent;
  concept: ConceptContent;
};

export type FlashcardContent = FlashcardContentByType[FlashcardType];

const contentSchemaByType = {
  basic: basicContentSchema,
  basic_reversed: basicContentSchema,
  cloze: clozeContentSchema,
  type_answer: typeAnswerContentSchema,
  image_occlusion: imageOcclusionContentSchema,
  concept: conceptContentSchema,
} as const;

const storedContentSchemaByType = {
  ...contentSchemaByType,
  cloze: z
    .object({ text: z.string().min(1), extra: optionalMarkdownSchema })
    .refine((c) => clozeClusters(c.text).length > 0, {
      message: "Cloze text must contain at least one {{…}} deletion.",
      path: ["text"],
    }),
} as const;

function normalizeClozeContent({ text, extra }: ClozeContent): ClozeContent {
  return { text: normalizeClozeText(text), ...(extra ? { extra } : {}) };
}

function normalizeContent<T extends FlashcardType>(
  type: T,
  content: FlashcardContentByType[T],
): FlashcardContentByType[T] {
  if (type !== "cloze") return content;
  return normalizeClozeContent(content as ClozeContent) as FlashcardContentByType[T];
}

export function validateContent<T extends FlashcardType>(
  type: T,
  content: unknown,
): FlashcardContentByType[T] {
  return normalizeContent(
    type,
    contentSchemaByType[type].parse(content) as FlashcardContentByType[T],
  );
}

export function parseStoredContent(
  type: string,
  raw: string,
): { type: FlashcardType; content: FlashcardContent } {
  if (!isFlashcardType(type)) {
    throw new Error(`Unknown flashcard type: ${type}`);
  }
  const parsed = JSON.parse(raw) as unknown;
  const content = storedContentSchemaByType[type].parse(parsed) as FlashcardContent;
  if (type === "cloze") {
    return { type, content: normalizeClozeContent(content as ClozeContent) };
  }
  return { type, content };
}

export function serializeContent(content: FlashcardContent): string {
  return JSON.stringify(content);
}
