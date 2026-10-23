# Agent OAuth and authoring walkthrough, 2026-10-23

## Environment and method

Ran the checkout's isolated local backend and web app with `pnpm worktree:setup`
and `pnpm dev`. Web origin was `http://armin-a054a464ca.localhost:39712`, Convex
API port 39714, and Convex HTTP/MCP port 39715. Used synthetic local accounts.
No cloud deployment, real provider account connection, or production data was
used. Temporary clients and credentials stayed in ignored `.armin/` files.

Used agent-browser in the `armin-agents-logic` session to sign in normally, open
an OAuth consent request, approve its creation-only defaults, and later revoke a
connection through Settings. A loopback OAuth callback exchanged the returned
code with an S256 verifier. The official TypeScript MCP SDK client then connected
to the running HTTP endpoint and called the tools. Additional permission checks
used the ordinary authenticated Convex API and a second synthetic account,
created with operator-only local component calls using the existing seed pattern.
No fixture endpoint or authorization bypass was added to the app.

## Passed checks

- OAuth discovery metadata, the unauthenticated 401 challenge, and SDK
  initialization work. The SDK discovers nine tools, with no deletion tool.
- Default consent hides the existing sample library. It grants creation and
  access to the new connection's decks, without editing other content.
- One `save_cards` call creates basic, reversed, cloze, and typed-answer cards
  plus a prerequisite. Returned links point to the local web deck.
- An identical request ID and payload returns the original IDs. Reusing that ID
  with a different deck name fails without creating another deck.
- Deck reads paginate correctly with Convex cursors. The walkthrough found an
  overly restrictive 200-character cursor limit; it was increased to 8192 and
  pagination was rerun successfully, including the terminal page.
- A cycle and a stale graph revision are rejected. An invalid cyclic batch rolls
  back its deck, cards, links, retry record, and activity.
- A valid content edit succeeds. A stale card version is rejected. Converting a
  reversed card to basic is rejected because it would remove the reverse review
  unit and its history.
- Archive and unarchive preserve the card. An unlinked card moves successfully;
  moving a linked card fails rather than silently deleting graph edges. Deck
  renaming succeeds against the current version.
- Sharing a selected existing deck allows reads but rejects edits and additions
  while edit permission is off. Explicitly enabling edits allows a tagged-card
  update. Disabling deck creation blocks new decks.
- Narrowing a grant applies immediately. The server clears dormant edit
  permission for the creation-only scope.
- A whole-library grant cannot read another account's deck. A foreign deck cannot
  be put in a selected-deck grant, and another account cannot revoke a connection.
- Connection listings do not return raw credentials or token hashes.
- Authorization-code replay and resource-audience mismatch are rejected.
- Unsafe callback schemes, non-loopback HTTP callbacks, URL credentials, and
  fragments are rejected. An unregistered authorization callback is rejected.
- An incorrect PKCE verifier fails without consuming the valid authorization
  code. The correct verifier then succeeds.
- Refresh rotates credentials. Reusing the previous refresh token revokes the
  connection, making the latest access token fail immediately.
- Browser requests from an unapproved Origin are rejected.
- A final fresh connection successfully performs 120 authoring writes. The next
  new write is rejected without changing the deck; an identical earlier retry
  still succeeds without consuming more budget. Activity reads remain capped
  at 50. That final QA connection was revoked after the check.
- Revoking a separate connection in the actual Settings dialog immediately makes
  its access token return 401 and its refresh token exchange fail.

## Validation and limits

`pnpm check` passes with zero errors. It reports 59 existing React compiler lint
warnings elsewhere in the app. The web production build and mobile bundle check
pass. The web build retains existing CSS sourcemap warnings.

The frontend walkthrough, including desktop, dark mode, and an emulated mobile
viewport, is recorded separately. An emulated viewport is not a physical device.
No automated unit/integration/E2E suite was added, following the project policy.
These were bounded checks against the running local implementation.

Live ChatGPT, Claude, Claude Code, and Codex application connections have not been
verified. Hosted chat apps cannot reach the local loopback deployment. A public
HTTPS deployment and suitable provider accounts are needed for that acceptance
step. No directory listing or production deployment is claimed.
