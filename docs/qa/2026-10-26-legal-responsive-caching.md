# Legal pages: responsive table and caching

Validated locally on 26 October 2026 at the isolated worktree origin
`http://armin-8ad288bdab.localhost:11456`.

## Walkthrough

- Used agent-browser in a dedicated Chromium session, with emulated 320 × 800
  and 1280 × 900 viewports. These are browser viewport checks, not real devices.
- At 320px, the privacy table displays each row as a vertical sequence labeled
  Data, Why, Used by. All nine values remain visible in normal document flow;
  document scroll width equals viewport width (320px).
- At 1280px, the table retains three columns and hides the repeated mobile labels.
  Inspected screenshots at both widths. The accessibility snapshot retains the
  table, row groups, rows, column headers, and cells at the mobile width.
- Opened `/terms` and checked its heading, legal content, and footer links.
- The main-content axe scan reported zero violations and an incomplete contrast
  check requiring manual review; it is not a complete accessibility certification.

## HTTP and session checks

- `/privacy` and `/terms` respond with HTTP 200 and
  `Cache-Control: public, max-age=300, s-maxage=300`.
- Signed in to the isolated backend using the seeded sample account, then fetched
  both documents with those session cookies. Responses set no cookies and contain
  neither the session-cookie values nor the sample account email.
- Repeated the signed-in checks for `/privacy/` and `/PRIVACY`; both safely use the
  public response. The root skips authentication based on matched route IDs,
  rather than the spelling of the URL.
- Other routes retain the root's `private, no-store` header and session loading.
- This verifies local response headers, not a production CDN cache hit. Deployment
  and production cache behavior have not been verified.

## Project checks

- `pnpm check`: passes, zero errors and 59 existing warnings.
- `pnpm --filter @armin/web build`: passes.
- `pnpm --filter @armin/mobile check:bundle`: passes for Android and iOS.
- Impeccable mechanical detector: no findings in the changed component and CSS.
