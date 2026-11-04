import type { VercelGatewayChatModel } from "@tanstack/ai-vercel-gateway";
import { z } from "zod";
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
 * - gateway: a model behind the Vercel AI Gateway, called through TanStack
 *   AI, configured by `AI_GATEWAY_API_KEY` and `AI_GATEWAY_MODEL`.
 *
 * The gateway provider runs only in the Node runtime: in Convex's default
 * runtime the adapter's streamed response fails to close. The generation
 * action is a "use node" module, and TanStack AI is imported lazily, so the
 * queries and mutations that read `selectProvider` for availability never
 * load it.
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

/** The gateway's API key. Never logged, returned, or stored. */
export const GATEWAY_KEY_ENV = "AI_GATEWAY_API_KEY";
/** The gateway model ID, in `creator/model` form (such as `openai/gpt-5-mini`). */
export const GATEWAY_MODEL_ENV = "AI_GATEWAY_MODEL";

/** Why concept cards are off when no provider is configured. */
export const GENERATION_UNAVAILABLE = "Concept cards aren't available on this server yet.";

/**
 * The provider this deployment is configured for, or why generation is off.
 * An enabled fake wins, so a local deployment never spends tokens unless the
 * fake is turned off. Reads only deployment variables, so queries and
 * mutations can call it to report and enforce availability.
 */
export function selectProvider() {
  if (process.env[FAKE_GENERATOR_ENV] === "true") {
    if (fakeGeneratorAllowed()) return { provider: fakeProvider, unavailable: null };
    console.error(`${FAKE_GENERATOR_ENV} is set outside a local deployment and was ignored.`);
  }
  const apiKey = process.env[GATEWAY_KEY_ENV]?.trim();
  const model = process.env[GATEWAY_MODEL_ENV]?.trim();
  if (apiKey && model) return { provider: gatewayProvider({ apiKey, model }), unavailable: null };
  return { provider: null, unavailable: GENERATION_UNAVAILABLE };
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

/** The shape the model is asked for. Each variant is validated separately afterwards. */
const batchSchema = z.object({
  variants: z.array(z.object({ exercise: z.string(), solution: z.string() })),
});

const SYSTEM_PROMPT = `You write practice exercises for a spaced-repetition flashcard app.
A concept card describes a skill with a brief and one worked example. You write new exercises that practice the same skill as the example, each with a complete worked solution.

Rules:
- Follow the brief: practice what it names, vary what it says to vary, keep its difficulty, and avoid what it says to avoid.
- Match the worked example's format and level of detail.
- Each exercise must be self-contained and different from every other exercise, including the ones listed to avoid. Change the substance (numbers, objects, cases), not just the wording.
- Solutions must be correct and worked step by step, ending with the result.
- Use plain text and Markdown only. Write mathematics in KaTeX with $...$ inline and $$...$$ for display equations.
- Never include images, audio, links, HTML, or code that draws a figure. If the skill seems to need a picture, describe it in words.`;

/** The user message: the template, the exercises to avoid, and how many to write. */
function generationPrompt({ template, avoid, count }: GenerationRequest) {
  const avoidList =
    avoid.length > 0
      ? avoid.map((exercise, index) => `${index + 1}. ${exercise}`).join("\n\n")
      : "(none yet)";
  return `Write ${count} new exercises for this concept card.

<brief>
${template.brief}
</brief>

<worked_example>
<exercise>
${template.example.exercise}
</exercise>
<solution>
${template.example.solution}
</solution>
</worked_example>

<exercises_to_avoid>
${avoidList}
</exercises_to_avoid>

Return exactly ${count} items in "variants", each with an "exercise" and its "solution".`;
}

/** One model call may take this long before it is abandoned. */
const GATEWAY_TIMEOUT_MS = 90_000;
/** Rate-limited or briefly unavailable calls are tried this many more times. */
const GATEWAY_RETRIES = 3;
/**
 * Backoff before each retry: 2 s, 4 s, 8 s. The thrown error carries no
 * Retry-After, so the wait doubles instead of following it.
 */
const RETRY_BASE_MS = 2_000;

/**
 * The HTTP status of a failed gateway call. A structured-output `chat()`
 * throws a plain Error whose `code` is the status as a string ("429"); the
 * OpenAI client's own error (with `status`) is checked too, in case a version
 * passes it through.
 */
function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const { status, code } = error as { status?: unknown; code?: unknown };
  if (typeof status === "number") return status;
  if (typeof code === "string" && /^\d{3}$/.test(code)) return Number(code);
  return null;
}

/** Statuses worth another attempt: rate limits and transient gateway failures. */
function retryable(status: number | null) {
  return status === 429 || (status !== null && status >= 500);
}

/**
 * Learner-facing reasons for gateway failures. They name what happened in
 * general terms only: never the provider's message, the model, or the key.
 */
function gatewayFailure(status: number | null) {
  if (status === 401 || status === 403)
    return new GenerationError("Variant generation isn't working on this server right now.");
  if (status === 429)
    return new GenerationError("The variant generator is busy. Try again in a few minutes.");
  if (status !== null && status >= 500)
    return new GenerationError("The variant generator is unavailable. Try again later.");
  return new GenerationError("The variant generator ran into an error.");
}

/**
 * The real provider: one structured-output call through TanStack AI's Vercel
 * AI Gateway adapter (Responses API, JSON schema output). The OpenAI client's
 * own retries are off so this loop alone decides: 429 and 5xx are retried with
 * backoff, everything else (401 included) fails at once. Four timed-out
 * attempts plus the waits take at most about 6.5 minutes, inside a Convex
 * action's 10-minute limit.
 */
export function gatewayProvider({ apiKey, model }: { apiKey: string; model: string }) {
  const provider: VariantProvider = {
    name: "gateway",
    generate: async (request) => {
      const [{ chat }, { createVercelGatewayText }] = await Promise.all([
        import("@tanstack/ai"),
        import("@tanstack/ai-vercel-gateway"),
      ]);
      const adapter = createVercelGatewayText(model as VercelGatewayChatModel, apiKey, {
        maxRetries: 0,
        timeout: GATEWAY_TIMEOUT_MS,
      });
      for (let attempt = 0; ; attempt++) {
        try {
          const output = await chat({
            adapter,
            threadId: crypto.randomUUID(),
            systemPrompts: [SYSTEM_PROMPT],
            messages: [{ role: "user", content: generationPrompt(request) }],
            outputSchema: batchSchema,
            promptCache: "none",
            debug: false,
          });
          return output.variants;
        } catch (error) {
          const status = errorStatus(error);
          // Status and error name only: provider messages can echo the request.
          console.error(
            `Gateway call failed (attempt ${attempt + 1}, status ${status ?? "none"}, ${error instanceof Error ? error.name : typeof error}).`,
          );
          if (!retryable(status) || attempt >= GATEWAY_RETRIES) throw gatewayFailure(status);
          await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * 2 ** attempt));
        }
      }
    },
  };
  return provider;
}
