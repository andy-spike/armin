# Armin mobile

Placeholder for the Armin mobile app. The stack has not been chosen yet.

Whatever stack is picked should reuse the study domain from `@armin/core`
(`packages/core`): the database schema, flashcard types, FSRS scheduling rules,
and scheduling presets. Two things to keep in mind when choosing:

- `@armin/core` exports TypeScript source directly, so the app's bundler must
  compile workspace packages (Metro, Vite, and similar bundlers can).
- The schema generates ids with `crypto.randomUUID()`. React Native's Hermes
  engine does not provide it, so a React Native app needs a polyfill.

This folder has no `package.json` yet, so it is not a workspace project. Add one
with the chosen stack's dependencies to register it with pnpm and Turborepo.
