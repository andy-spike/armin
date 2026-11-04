import {
  conceptVariantSchema,
  type ConceptContent,
  type ConceptVariant,
} from "@armin/core/flashcard-types";
import { isSelfHosted } from "./selfHost";

/*
 * The generator module: the only code that ever asks a model for concept card
 * variants (ADR 0023). Callers hand it a template and the exercises to avoid
 * and get back a validated batch. A provider only produces candidates; every
 * candidate is checked against the core variant schema here, so no provider
 * can store an invalid or image-bearing variant.
 *
 * Providers:
 * - fake: deterministic numbered variants for local development and
 *   walkthroughs, at no cost. Dev-only; see `fakeGeneratorAllowed`.
 * - The model provider (TanStack AI through the Vercel AI Gateway) is added
 *   next to it and selected from its deployment variables.
 */

export type GenerationRequest = {
  template: ConceptContent;
  /** Exercises already in the pool, which the batch should not repeat. */
  avoid: string[];
  /** How many variants to ask for. */
  count: number;
};

export type VariantProvider = {
  /** Names the provider in logs; never a secret. */
  name: string;
  /** Candidate variants, unvalidated. Throw `GenerationError` for a reason the learner should see. */
  generate: (request: GenerationRequest) => Promise<unknown[]>;
};

/** A failure whose message is safe and useful to show on the card. */
export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

/** Dev-only: `true` selects the fake provider on a local deployment. */
export const FAKE_GENERATOR_ENV = "CONCEPT_GENERATOR_FAKE";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "0.0.0.0"]);

/**
 * The fake runs only on a local development deployment: one this machine
 * serves on a loopback address (a cloud deployment's URL is never one) that
 * is not a self-hosted instance. Setting the variable anywhere else leaves
 * generation unavailable instead of storing fake exercises.
 */
function fakeGeneratorAllowed() {
  if (isSelfHosted()) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(process.env.CONVEX_CLOUD_URL ?? "").hostname);
  } catch {
    return false;
  }
}

/** The provider this deployment is configured for, or why generation is off. */
export function selectProvider() {
  if (process.env[FAKE_GENERATOR_ENV] === "true") {
    if (fakeGeneratorAllowed()) return { provider: fakeProvider, unavailable: null };
    console.error(`${FAKE_GENERATOR_ENV} is set outside a local deployment and was ignored.`);
  }
  return {
    provider: null,
    unavailable: "Variant generation isn't set up on this server yet.",
  };
}

/** Ask the provider for a batch and keep only the candidates that are valid variants. */
export async function generateVariants(provider: VariantProvider, request: GenerationRequest) {
  const candidates = await provider.generate(request);
  const variants: ConceptVariant[] = [];
  for (const candidate of candidates.slice(0, request.count)) {
    const parsed = conceptVariantSchema.safeParse(candidate);
    if (parsed.success) variants.push(parsed.data);
  }
  return { variants, dropped: Math.min(candidates.length, request.count) - variants.length };
}

/** The first line of the brief, short enough to label an exercise. */
function topic(brief: string) {
  const line = brief.trim().split("\n")[0]!.trim();
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/** A model call takes seconds; the fake waits too, so walkthroughs can see "generating". */
const FAKE_DELAY_MS = 3000;

/**
 * Fixed, numbered variants that continue after the pool's existing exercises,
 * each with an inline equation so walkthroughs exercise KaTeX rendering.
 */
const fakeProvider: VariantProvider = {
  name: "fake",
  generate: async ({ template, avoid, count }) => {
    await new Promise((resolve) => setTimeout(resolve, FAKE_DELAY_MS));
    return Array.from({ length: count }, (_, index) => {
      const n = avoid.length + index + 1;
      return {
        exercise: `Practice variant ${n} — ${topic(template.brief)}\n\nCompute $${n} \\times ${n + 2}$.`,
        solution: `Multiply the factors: $${n} \\times ${n + 2} = ${n * (n + 2)}$.`,
      };
    });
  },
};
