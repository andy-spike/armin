import type { VercelGatewayChatModel } from "@tanstack/ai-vercel-gateway";
import { z } from "zod";
import {
  conceptVariantSchema,
  type ConceptContent,
  type ConceptVariant,
} from "@armin/core/flashcard-types";
import { isSelfHosted } from "./selfHost";

export type GenerationRequest = {
  template: ConceptContent;
  avoid: string[];
  count: number;
};

export type VariantProvider = {
  name: string;
  generate: (request: GenerationRequest) => Promise<unknown[]>;
};

export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

export const FAKE_GENERATOR_ENV = "CONCEPT_GENERATOR_FAKE";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "0.0.0.0"]);

function fakeGeneratorAllowed() {
  if (isSelfHosted()) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(process.env.CONVEX_CLOUD_URL ?? "").hostname);
  } catch {
    return false;
  }
}

export const GATEWAY_KEY_ENV = "AI_GATEWAY_API_KEY";
export const GATEWAY_MODEL_ENV = "AI_GATEWAY_MODEL";

export const GENERATION_UNAVAILABLE = "Concept cards aren't available on this server yet.";

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

export async function generateVariants(provider: VariantProvider, request: GenerationRequest) {
  const candidates = await provider.generate(request);
  const variants: ConceptVariant[] = [];
  for (const candidate of candidates.slice(0, request.count)) {
    const parsed = conceptVariantSchema.safeParse(candidate);
    if (parsed.success) variants.push(parsed.data);
  }
  return { variants, dropped: Math.min(candidates.length, request.count) - variants.length };
}

function topic(brief: string) {
  const line = brief.trim().split("\n")[0]!.trim();
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

const FAKE_DELAY_MS = 3000;

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

const GATEWAY_TIMEOUT_MS = 90_000;
const GATEWAY_RETRIES = 3;
const RETRY_BASE_MS = 2_000;

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const { status, code } = error as { status?: unknown; code?: unknown };
  if (typeof status === "number") return status;
  if (typeof code === "string" && /^\d{3}$/.test(code)) return Number(code);
  return null;
}

function retryable(status: number | null) {
  return status === 429 || (status !== null && status >= 500);
}

function gatewayFailure(status: number | null) {
  if (status === 401 || status === 403)
    return new GenerationError("Variant generation isn't working on this server right now.");
  if (status === 429)
    return new GenerationError("The variant generator is busy. Try again in a few minutes.");
  if (status !== null && status >= 500)
    return new GenerationError("The variant generator is unavailable. Try again later.");
  return new GenerationError("The variant generator ran into an error.");
}

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
