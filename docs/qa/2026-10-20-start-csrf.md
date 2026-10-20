# TanStack Start CSRF middleware check

Verified against the running web dev server at `http://localhost:3000`.

The custom `apps/web/src/start.ts` omitted TanStack Start's CSRF middleware.
Before the change, a direct request to the existing `getAuth` server function
with `Origin: https://cross-site.example` and `x-tsr-serverFn: true` returned 200.

Added `createCsrfMiddleware` to global request middleware, filtered to
`handlerType === "serverFn"`, while preserving `defaultSsr: false`.

After the change, direct requests to the same server function returned:

- Same-origin Origin header: 200.
- Foreign Origin header: 403.
- `Sec-Fetch-Site: same-origin`: 200.
- `Sec-Fetch-Site: cross-site`: 403.
- No Origin, Referer, or Fetch Metadata headers: 403.

The request script extracted the dev server function ID from Vite's transformed
`/src/routes/__root.tsx` module and sent `x-tsr-serverFn: true` on each request.
These were unauthenticated requests; no session token was logged.

Reloaded the app in T3's collaborative browser at a 1280 by 800 viewport.
The existing browser session loaded the authenticated Decks page with both decks
visible. Auth session and Convex token requests returned 200, and the browser
console contained no errors. This was a desktop browser check, not a mobile
device walkthrough.

Validation passed:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @armin/web build`
- `pnpm --filter @armin/mobile check:bundle`, Android and iOS exports

No test suites were added, following the web migration validation policy.

Reference: [TanStack Start server function same-origin protection](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions#same-origin-requests).
