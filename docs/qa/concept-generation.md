# Concept card generation with a real model

Recorded 11 November 2026 for #102 on a local deployment, through Vercel AI
Gateway with `AI_GATEWAY_MODEL=anthropic/claude-haiku-5.5`. The key is not
recorded here.

## Run

Three concept cards were created as the local test user, each with a brief and
one worked example. Each card's first batch generated 10 exercises
(`CONCEPT_BATCH_SIZE`).

| Subject                        | Brief                                                              | Generated | Correct |
| ------------------------------ | ------------------------------------------------------------------ | --------- | ------- |
| Calculus: chain rule           | One chain-rule step; vary powers, trig, and exponentials           | 10        | 10      |
| Chemistry: molar mass          | Simple compounds from a given list of atomic masses                | 10        | 10      |
| Spanish: preterite conjugation | Regular -ar, -er, and -ir verbs; vary the verb and subject pronoun | 10        | 10      |

Every solution was checked by hand. Each exercise was different from the
others and from the worked example, followed the brief (one chain-rule step,
only the listed elements, only regular verbs), and rendered its KaTeX.

## Cost

The gateway's `total_used` rose by $0.00297 for the 30 exercises, about
$0.0001 per exercise. Later batches send up to 490 earlier exercises to avoid,
which adds roughly 12,000 input tokens per batch at $0.10 per million: about
$0.0001 more per exercise. A Pro library that uses the whole monthly allowance
of 2,000 exercises therefore costs well under $1 a month against the $6 price.
The allowance and batch constants stay as they are.
