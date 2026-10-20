# Dev startup cancellation error

Verified on 2026-10-20 in the main Linux checkout, using the T3 collaborative
Chromium desktop browser at http://localhost:3000. The shell used Node 26.11.1;
mise.toml pins Node 24.20.0.

## Reproduction and cause

Running `pnpm dev` with browser tabs reconnecting reproduced `Error: aborted`
with `code: ECONNRESET` on three starts. Vite and Convex still reached ready state,
and HTTP requests to the app succeeded. Temporary console instrumentation traced
this to TanStack Start's `resolveErrorStatus`, called through `handleStartError`.
The instrumentation was removed after diagnosis.

Start logged an incoming request cancellation as an unhandled application error.
The pnpm patch skips this log only when the incoming request signal is aborted
and the error is its cancellation reason or Node's specific aborted/ECONNRESET
error. Other failures retain their logging. Both shipped JavaScript and TypeScript
source are patched.

## Walkthrough and validation

- Ran `pnpm dev` twice after applying the patch with browser tabs open. Both runs
  reached Vite ready and Convex functions ready without the aborted stack trace.
- The desktop browser reconnected and rendered the authenticated Decks page.
  Session and Convex token requests returned HTTP 200. No browser console errors
  appeared during reconnection.
- Confirmed `GET /` returned HTTP 200 using curl.
- A temporary Node assertion script exercised the actual patched `withStartRequest`
  and `resolveErrorResponseStatus` exports. Incoming cancellation produced no log;
  the same reset with an active incoming request still logged; an unrelated error
  on a cancelled request still logged. All assertions passed.
- `pnpm typecheck` and `pnpm lint` passed.
- `pnpm test` completed with no configured test tasks.
- `pnpm --filter @armin/web build` passed.
- `pnpm --filter @armin/mobile check:bundle` passed for Android and iOS exports.

No automated suite was added, following repository policy. Reevaluate the patch
when upgrading TanStack Start and remove it once upstream handles cancellations.
