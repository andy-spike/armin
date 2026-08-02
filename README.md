# Armin

Armin is a hosted, multi-user spaced-repetition web app for building durable,
hierarchical knowledge through flashcards, decks, reviews, and prerequisite
relationships.

The study feature set is free and unlimited; a paid plan ($5/month) adds AI
capabilities — card generation, on-demand explanations, and card improvement.

This repository is currently being rebuilt from an Electron desktop app into a
hosted SaaS on Next.js. The domain model and design survive; the implementation
is new. Until the app exists again, this repo holds the product's context docs:

- `CONTEXT.md` — the ubiquitous language (User, Study Space, Deck, Flashcard,
  Review unit, Prerequisite graph, AI features)
- `docs/adr/` — architectural decisions (payments via Polar.sh, AI via
  OpenRouter + Mastra, free tier + paid plan)
- `PRODUCT.md` — who the product is for and how it should feel
- `DESIGN.md` — the visual system
- `docs/testing.md` and `docs/migrations.md` — validation and DB discipline
- `docs/agents/` — how engineering agents work with this repo

The build plan lives in `docs/migration-plan.md`.
