# Concept cards practice generated exercise variants

Spaced repetition decides when to practice something; Armin's existing card types
then show the same prompt every time. For skills such as taking derivatives, that
trains recall of one answer instead of the method. A **concept card** combines
spaced repetition with exercise solving: FSRS schedules the concept, and each
review poses a different exercise that practices it.

## Shape

A concept card is a new flashcard type. Its author writes a **template**: a
natural-language brief (the concept, what to vary, the intended difficulty, what
to avoid) plus one worked example. Exercises come from a **variant pool** attached
to the card; each **variant** is an exercise with its worked solution. Variants
are usable as soon as they are added, and the learner can edit, delete, or flag
one. A parameterized template (variables and ranges) was rejected because it only
fits formulaic topics; an example-only template was rejected because it gives too
little control over drift.

The card generates exactly **one review unit**, with a fixed `subKey` (ADR 0004).
Every variant counts toward the same memory state, so FSRS tracks the concept
rather than any instance. Per-variant review units were rejected because they
would schedule instances again. Sub-skill units within one card were deferred:
separate concept cards linked by prerequisites cover the same need. With one
unit, securedness (ADR 0001), prerequisite locks, and permanent access (ADR 0021)
apply unchanged.

## Review

A review shows a random unseen variant. The learner solves it, reveals the worked
solution, and rates Again, Hard, Good, or Easy, as with any card; the rating
updates the concept's unit and marks the variant seen. LLM grading of a typed
answer and automatic checking of a final answer were rejected for the first
version: self-rating against a worked solution keeps the review loop free of
model calls and grading errors.

When no unseen variant remains, the review reuses the variant seen longest ago
and Browse marks the card as low on variants. Review never blocks on generation,
and never falls back to the worked example, the most memorized instance.

## Generation

Variants are pre-generated, never generated during a review. A live model call
per review was rejected for its latency, cost, and mid-session failure mode.

A backend job calls one server-chosen model, configured by deployment environment
variables, to generate a batch of variants (about ten) when a card is created and
again whenever its unseen variants drop below a low-water mark (about three).
Without that configuration, generation is off. Hosted generation counts against a
per-library monthly variant allowance defined in `@armin/core/plans`. When the
allowance runs out, review keeps reusing variants least-recent first and the card
shows that the allowance is used until the next month. Per-account model choice
and user-supplied keys on the hosted service were rejected for their settings,
pricing, and key-storage burden.

Model calls go through [TanStack AI](https://tanstack.com/ai/latest/) and its
Vercel AI Gateway adapter (`@tanstack/ai-vercel-gateway`), so changing the model
or provider means changing one gateway model ID (`creator/model`) rather than
code. The deployment holds `AI_GATEWAY_API_KEY` and the model ID; self-hosters
set their own. Every model call sits behind one generator module with a gateway
provider and a deterministic fake provider. Local deployments use the fake, so
development and walkthroughs need no key and cost nothing, and the fake stays in
use until a model is chosen.

## Availability

On armincards.app, concept cards are a Pro feature; free libraries cannot create
or review them. On a self-hosted instance, which has no billing, the operator
supplies their own model key in the deployment environment; concept cards are
available whenever it is set, without a monthly allowance.

## Deferred

- **MCP.** Connected assistants cannot create concept cards or add variants. The
  backend job is the only source of variants in the first version.
- **Images.** Templates and variants are text and KaTeX only. Models cannot
  reliably draw exact figures, so generated images need their own decision when
  images are added.
- **Anki import** does not create concept cards. Exports include each card's
  template and variants.
