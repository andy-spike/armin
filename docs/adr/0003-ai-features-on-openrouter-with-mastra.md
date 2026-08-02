# AI features are built on OpenRouter with Mastra

The paid AI features (card/deck generation, on-demand explanations, card
improvement) are built on **Mastra** as the agents framework with **OpenRouter**
as the LLM gateway. Choosing OpenRouter keeps model choice flexible (one API
across many providers) and avoids lock-in to a single model vendor; Mastra
provides the agent/tool scaffolding the features need.

Consequences: the AI integration is a thin layer over OpenRouter's API and
Mastra's abstractions, so swapping models or providers later is a configuration
change rather than a rewrite. The rest of the stack — Vercel (Next.js), Neon
(Postgres), Vercel Blob (media), Polar (payments) — is unchanged by this
decision.
