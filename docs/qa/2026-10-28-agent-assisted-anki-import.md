# Agent-assisted Anki import verification

Verified on 2026-10-28 in this retained worktree. No production deployment, PR,
push, or commit. The implementation delegate was stopped at the user's request;
its partial implementation was reviewed, completed and verified by the parent.

## Runtime and distribution

Built the published 1.0.0 kit and fetched it through this checkout's running web
server at `http://armin-bed6ac28fa.localhost:27184/anki-kit/armin-anki-kit-1.0.0.zip`.
Checked its SHA-256 against `packages/core/src/anki/kit-manifest.json`. Extracted
it to a fresh temporary directory outside the repository, with no installed
packages, and executed it there with Node.js 24.22.1 on Linux x64. No repository
checkout or dependency installation was required by the downloaded kit.

The kit contains bundled JavaScript, SQLite WASM, instructions, license and
third-party notices. `pnpm anki:kit:verify` confirmed two builds are identical and
match the committed checksum. Web production and Cloudflare deployment build
scripts generate and verify the artifact before building.

Four synthetic fixtures used the same reader/converter as browser import:

- modern zstd package: 20 cards;
- legacy package: 20 cards;
- text export: 2,000 cards;
- approximately 96 MiB media package: 2,000 cards and 2,000 images.

Compared every resulting card's content, type, tags, provenance, key order, media
resolution and review-unit counts with direct execution of the shared converter.
All matched. Verified the SHA-256 of all 2,000 extracted images. Also constructed
an unresolved-only legacy package: it produced zero cards, 20 unresolved notes,
and original source fields/templates for requested repair, without silently
omitting notes or refusing to produce a preview.

These are synthetic fixtures and local runtime checks. Node 20/22, macOS,
Windows, and actual hosted Claude/ChatGPT sandboxes were not exercised. The guide
requires attachment access and a Node-capable execution environment; universal
chat-client compatibility is not claimed.

## MCP transport and backend lifecycle

Used actual HTTP JSON-RPC `tools/call` requests to the isolated local Convex MCP
endpoint, with disposable owner libraries and operator-seeded scoped connections.
This exercised bearer verification and connection permissions, not the OAuth
consent handshake (existing flow). No secrets were included in this record.

Passed checks:

- Guide returns the exact published kit URL and checksum.
- Foreign connections cannot read another connection's import.
- Invalid image bytes are refused; valid PNG upload is sniffed and addressed by
  content hash; a duplicate upload shares one stored image.
- Basic cards with images and image-occlusion cards stage successfully.
- Identical batch retries return the prior result without adding cards twice.
- Staging produces no product decks/cards; agent deck lists remain empty.
- Preview reports actual per-deck counts and a content commitment. Incorrect
  checksum and `confirm: false` cannot finalize.
- Finalization creates visible decks once, with new review units and zero reps.
- Raw unresolved entries from the kit are accepted without removing metadata.
- Every unresolved key needs a disposition; duplicate skips are refused.
- Requested repairs are listed by key in the final preview.
- Cancelled sessions refuse late uploads and batches.
- Expired sessions cannot renew upload tokens and the sweeper expires them.
- Library capacity is rejected before staging.
- Revoking a connection invalidates its scoped upload token.
- A full 2,000-card kit output staged in 20 batches and finalized through bounded
  materialization. Deck lists stayed empty during materialization, then published
  the complete deck. All 2,000 cards started fresh.
- Cancelling a second 2,000-card import during materialization removed staged
  cards, hidden decks, materialized cards and review units.

Fixed during review: direct ownership lookups hiding staging decks; revoked
upload/background grants; duplicate skip validation; expired token renewal;
content-bound preview checksums; actual deck counts; unresolved-only manifests;
bounded cleanup of large image sets; and materialization budgets based on
content size/review-unit expansion. Capacity reads use compact summaries instead
of loading every existing card body.

Temporary QA-only Convex helpers were removed after the walkthrough. Disposable
libraries and the synthetic browser/demo import decks were cleaned up. Previous
benchmark experiments remain separate from product import routes.

## Running browser walkthrough

Used agent-browser desktop Chromium at the exact worktree origin, signing in
through the normal app. Checked desktop 1280×800 and an emulated 390×844 viewport;
the latter is not a physical phone check.

- Both deck-list and Settings → Data entry points open the modal immediately.
- The recommended assistant route and browser file chooser are visible together.
- Setup instructions expand on demand. The setup link navigates to Settings →
  AI assistants, with that tab selected; it is a semantic link, not a nested button.
- Selected `smoke-modern.apkg` in the browser route. The preview showed 20 cards,
  retained the keep-progress/start-fresh options and offered 40 past reviews.
- Imported with progress preserved. The result reported the new 20-card deck,
  confirming the original browser path remains functional.
- No horizontal clipping in the inspected desktop and emulated mobile views.

## Repository validation

Passed validation: `pnpm check`, `pnpm --filter @armin/web build`,
`pnpm --filter @armin/web build:cloudflare`,
`pnpm --filter @armin/mobile check:bundle`, `pnpm plugin:package`,
`pnpm anki:kit:verify`, and `git diff --check`.

Fixture/lifecycle walkthroughs used temporary local scripts under ignored
`.armin/`; no unit, integration or E2E suite was added. Actual hosted chat-client
execution and production end-to-end delivery remain release verification tasks.

## Integration with current master before PR

Integrated `683d530` from master, including the MCP component migration and the
cram/statistics features. Import tools now register with the component-managed
server and pass its verified identity into import queries and mutations. Scoped
image uploads and scheduled materialization recheck the live component grant,
not retired token hashes or per-deck permission flags. Staging decks are also
excluded from the new per-deck cram and statistics routes.

Repeated the authenticated HTTP lifecycle checks using disposable component
OAuth grants. Component grant revocation (without setting an app-side revoked
flag) invalidated the scoped image upload token. Repeated both the successful
2,000-card materialization and cancellation-during-materialization walkthroughs.
All passed. Temporary operator helpers and disposable grants/libraries were
removed after verification.

The shared scheduler changes require converter kit 1.0.1 and a new published
checksum. Downloaded that kit from the local server into an isolated directory
and repeated modern, legacy, 2,000-card text and 2,000-image parity checks against
the updated converter; all passed. Web build, iOS/Android bundles, plugin
packaging and kit reproducibility also passed after integration. Previous
version-1.0.0 results above remain the record of the pre-integration checks.

After integration, repeated the signed-in browser walkthrough in the local
worktree app: the Anki dialog opens with the assistant recommendation and local
file chooser; its setup link navigates to the current AI assistants settings
panel. The final `pnpm check` passed formatting, lint and typechecking.
