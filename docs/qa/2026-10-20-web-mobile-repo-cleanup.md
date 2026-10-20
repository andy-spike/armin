# Web and mobile repository cleanup

Removed the Electron application, old sync server, sync-contract package,
desktop release workflow, AUR packaging, and unused shared Drizzle schema.
The study glossary and original decisions now live under `packages/core/`.
Historical documents are marked where they describe the retired layout.

## Validation

- `pnpm install --frozen-lockfile`: passed for the root and four workspaces.
- `pnpm typecheck`: passed for core, backend, web, and mobile.
- `pnpm lint`: passed.
- `pnpm --filter @armin/web build`: passed.
- `pnpm --filter @armin/mobile check:bundle`: passed for Android and iOS.
- `pnpm test`: completed; the remaining workspaces define no test tasks.
- `git diff --check`: passed.

Better Auth still resolves SQLite and Drizzle dependencies transitively. The
native SQLite build permission remains so a frozen install succeeds.

## Running web walkthrough

Ran `pnpm worktree:setup` in the assigned checkout. Convex initially returned
502 during setup, retried, and successfully configured the isolated deployment
and seeded the sample library. Started `pnpm dev:web` and opened
`http://armin-8491bfd873.localhost:16126`.

The T3 collaborative browser navigated successfully but its snapshot operation
timed out twice. Switched to an isolated agent-browser Chromium session.

1. Confirmed the sign-in form loaded.
2. Signed in using the synthetic account from `.armin/demo-account.json`.
3. Confirmed the deck list showed the sample library with four flashcards and
   three due review units.
4. Opened the sample deck. Confirmed basic, cloze, and typed-answer content
   loaded and the dependent card was marked Locked.

Closed the verification browser and stopped the web server afterward. No real
phone, simulator, or emulator walkthrough was performed; mobile verification
here consists of typechecking and Android/iOS bundle exports.
