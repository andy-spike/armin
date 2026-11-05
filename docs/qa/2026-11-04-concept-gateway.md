# Concept card generation through the AI Gateway walkthrough (2026-11-04)

Local worktree deployment, desktop Chromium via agent-browser (1440×960
viewport), sample account `test@example.com`, given complimentary Pro on the
local deployment for the walkthrough (the free plan has no variant allowance)
and returned to free afterwards. `AI_GATEWAY_API_KEY` was already set on the
local deployment and was never printed; deployment variables were checked by
name only. Usage rows were read with `pnpm exec convex data conceptVariantUsage`.

## Running the adapter in a Convex action

A temporary internal action (deleted before committing) called the gateway
provider directly:

- In Convex's default runtime, a real call failed inside the OpenAI client's
  stream reader ("The stream is not in a state that permits close"), escaping
  as an uncaught error. The same action as a `"use node"` module stored three
  valid variants from `google/gemini-2.5-flash-lite` in 1.3 s, so the
  generation action is now a Node action. No `convex.json` externals were
  needed.
- `chat()` with `outputSchema` works through the adapter (Responses API, JSON
  schema output).
- A bogus key: status 401, one attempt, no retry; reason "Variant generation
  isn't working on this server right now."
- An unknown model (`nobody/no-such-model`): status 404, one attempt.
- Stubbed `fetch` returning 429: retried after 2 s and 4 s, then stopped at the
  stubbed 401; with 429 throughout, four attempts at 0, 2, 6, and 14 s, then
  "The variant generator is busy. Try again in a few minutes." The error
  `chat()` throws carries the status as `code` but no Retry-After header, so
  the wait doubles instead.
- Logs showed only "Gateway call failed (attempt n, status s, Error)."

## In the app

1. With `CONCEPT_GENERATOR_FAKE=true` (and no `AI_GATEWAY_MODEL`), **Add card**
   offered the Concept type
   ([screenshot](2026-11-04-concept-gateway/concept-available.png)). The new
   card filled with 10 numbered fake variants
   ([screenshot](2026-11-04-concept-gateway/fake-ready.png)).
2. With the fake set to `false` (key set, no model ID), `concepts.availability`
   returned `available: false`. In **Add card** the Concept button was dimmed;
   hovering showed "Concept cards aren't available on this server yet."
   ([screenshot](2026-11-04-concept-gateway/concept-unavailable.png)), and
   clicking it left Basic selected.
3. Server-side refusal: `flashcards.create` for a concept card, run with the
   signed-in session's identity, failed with `INVALID` "Concept cards aren't
   available on this server yet."
4. Gateway error: with `AI_GATEWAY_MODEL=nobody/no-such-model`, a new concept
   card's job got a 404. The pool read "Generating variants failed. The variant
   generator ran into an error." with **Retry**
   ([screenshot](2026-11-04-concept-gateway/gateway-failed.png)). The usage row
   stayed at `used 45, reserved 0`, so the reservation was released.
5. With the model ID removed again, **Retry** failed the pool at once with
   "Concept cards aren't available on this server yet."
   ([screenshot](2026-11-04-concept-gateway/retry-unavailable.png)). No job was
   scheduled and nothing was reserved (`used 45, reserved 0`).
6. One real generation: with `AI_GATEWAY_MODEL=google/gemini-2.5-flash-lite`,
   **Retry** stored 10 model-written linear equations with solutions
   ([screenshot](2026-11-04-concept-gateway/gateway-ready.png)), and the row read
   `used 55, reserved 0`. The model ID was then removed and the fake set back
   to `true`; the Concept type was offered again.

Not exercised: a real 429 from the gateway (simulated with a stubbed `fetch`
above), and the self-hosted scripts, which were checked with `bash -n` only.
