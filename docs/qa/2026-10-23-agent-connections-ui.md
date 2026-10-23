# Agent connections UI walkthrough

Date: 2026-10-23
Area: Settings → AI assistants (guided setup, connections, activity) and the consent page `/connect-agent?request=…`
Branch: `t3/ai-agent-card-management`
Environment: isolated T3 worktree, `http://armin-a054a464ca.localhost:39712` (web) and `http://127.0.0.1:39715` (Convex HTTP, so the MCP address shown in Settings is `http://127.0.0.1:39715/mcp`), local Convex deployment, sample account `test@example.com`.
Browser: agent-browser managed Chromium, sessions `agentui-d0f2788ab8b9` (desktop, 1280×900) and `agentui-d0f2788ab8b9-anon` (agent-browser's "iPhone 14" emulation: 390×844 viewport at 3× pixel ratio). The mobile checks are an emulated viewport in desktop Chromium, not a real device or mobile browser.

Consent requests were created by hand against the dev backend with OAuth dynamic client registration and `GET /oauth/authorize` (S256 PKCE, `resource=http://127.0.0.1:39715/mcp`), so each page loaded from a real redirect to `/connect-agent?request=…`. The parent's separate protocol walkthrough used the same library at the same time ("Authoring QA", "Revocation QA"); its connections and decks appear in some screenshots and were not modified here.

**Not verified:** no real ChatGPT, Claude, Claude Code, or Codex was connected, so the provider setup steps were checked against official documentation only (see below). The consent redirect target (`http://127.0.0.1:8976/callback`) had nothing listening, so the browser landed on its connection-error page after approval; the redirect itself was confirmed by the browser leaving the app, not by receiving the code in a client.

## Results

| Area | Steps | Result |
| --- | --- | --- |
| Settings layout, desktop | Opened Settings → AI assistants at 1280 px | Found a bug: the long address and command lines stretched the shared `Section` grid past the viewport, clipping the Copy buttons. Fixed with `minmax(0,1fr)`; page width now equals viewport |
| Guided setup | Switched between Claude, ChatGPT, Claude Code, Codex; clicked Copy | Steps and commands change per assistant; Copy sets "Copied to clipboard" ([ChatGPT](2026-10-23-agent-connections-ui/guide-chatgpt-desktop.png), [Codex](2026-10-23-agent-connections-ui/guide-codex-desktop.png), [Claude Code, dark](2026-10-23-agent-connections-ui/guide-claude-code-dark.png)) |
| Consent, default | Opened a request as "Claude Code" | Unverified badge, redirect origin, "Only what it creates" selected, create on, edit off and disabled ([screenshot](2026-10-23-agent-connections-ui/consent-desktop-default.png)) |
| Consent, scoped existing access | Chose "Decks I choose", checked a deck, turned edit on, Allow access | Connection appeared as "Agent sample library · can create decks · can edit existing cards" ([screenshot](2026-10-23-agent-connections-ui/consent-desktop-selected-edit.png)) |
| Consent, validation | Chose "Decks I choose" with no deck | Allow access disabled and the reason shown inline |
| Consent, deny | Cancel on a "ChatGPT" request with a `https://chatgpt.com/…` redirect | Browser went to `…?error=access_denied&state=…` |
| Consent, dead links | Reused the denied request; opened `/connect-agent` with no parameter and with `request=nonsense` | "This request has expired" ([screenshot](2026-10-23-agent-connections-ui/consent-expired-desktop.png)); "This link is incomplete" ([screenshot](2026-10-23-agent-connections-ui/consent-missing-request.png)); garbage id shows the expired page |
| Consent, signed out | Opened a request in a clean session | Redirected to sign-in with the request preserved; after signing in, landed on that consent page |
| Consent, offline | Set the browser offline on an open request, then back online | Offline banner shown, Allow access disabled; re-enabled when back online ([screenshot](2026-10-23-agent-connections-ui/consent-offline-desktop.png)) |
| Consent, keyboard | Focused the first radio, pressed ArrowDown | Selection moved to "Decks I choose" with a visible focus ring ([screenshot](2026-10-23-agent-connections-ui/consent-keyboard-focus.png)) |
| Manage, scope switch | Opened Manage, switched to "Only what it creates" | Edit switch disabled with an explanation ([screenshot](2026-10-23-agent-connections-ui/manage-dialog-created-scope.png)) |
| Manage, save | Switched "Claude Code" to "My whole library", Save changes | "Access updated" toast; row summary changed to "Whole library · can create decks · can edit existing cards" |
| Manage, mobile | Opened Manage on the emulated phone, chose "Decks I choose" with none selected | Dialog body scrolls under a pinned footer; Save disabled; the reason shows beside the button ([screenshot](2026-10-23-agent-connections-ui/manage-dialog-mobile-selected.png)) |
| Revoke | Revoke on "Codex" → Revoke access | "Access revoked" toast; row moved to the bottom, shaded, marked Revoked with "Access ended …", actions removed ([dialog](2026-10-23-agent-connections-ui/revoke-dialog-desktop.png), [result](2026-10-23-agent-connections-ui/revoked-desktop.png)) |
| Revoked while Manage open | Opened Manage on the phone, revoked the same connection on desktop, kept the dialog open | Before the fix the dialog showed only "Connection not found." after Save. Now it says access was revoked and Save is disabled ([screenshot](2026-10-23-agent-connections-ui/manage-dialog-revoked-while-open-mobile.png)) |
| Activity | Read the list written by the parent's protocol run | Entries show summary, assistant, time, and a link to the deck; no secrets |
| Mobile, consent and Settings | 390 px wide | No horizontal overflow (`scrollWidth` 390); tab bar wraps to two rows; actions row fits ([consent](2026-10-23-agent-connections-ui/consent-mobile-default.png), [actions](2026-10-23-agent-connections-ui/consent-mobile-actions.png), [Settings](2026-10-23-agent-connections-ui/settings-mobile-top.png), [connections](2026-10-23-agent-connections-ui/settings-mobile-connections.png)) |
| Connections first | With at least one active connection, opened Settings | Connections and Activity come first and the guide follows as "Connect another assistant" ([screenshot](2026-10-23-agent-connections-ui/settings-desktop-connections-first.png)) |

## Fixes made during the walkthrough

- Shared `Section` grid (`settings-layout.tsx`) used `1fr`, which let nowrap content widen the column. Now `minmax(0,1fr)`; this also protects the other Settings tabs.
- Radios rendered as squares because the theme forces every border radius to 0, so they looked like the deck checkboxes. Single-choice options now use a diamond marker and a tinted selected row; the radio group runs edge to edge in its card.
- The example request wraps instead of scrolling horizontally.
- When any connection is active, the connection list and activity lead the tab.
- Manage and Revoke buttons carry the connection's absolute connected time in their accessible names, so two connections with the same name are distinguishable (absolute, because a relative time would change under a screen reader).
- The Manage dialog shows the disabled-Save reason in its footer, where it stays visible on a phone, and explains a connection revoked while it was open.
- Setup instructions were checked against official docs and corrected:
  - Claude: menu is **Customize → Connectors**; on Team and Enterprise an owner adds it under **Organization settings → Connectors** and members then choose Connect ([Claude connectors docs](https://www.claude.com/docs/connectors/custom/remote-mcp)).
  - ChatGPT: custom MCP servers start at `chatgpt.com/plugins`, with no developer-mode step; the docs don't name OAuth, so the step says "if asked" ([OpenAI docs](https://developers.openai.com/plugins/deploy/connect-chatgpt)). Plan availability isn't stated there, so the note only says plans and workspace policy decide.
  - Claude Code: `claude mcp add --transport http armin <url>`, default scope local, `--scope user` for all projects, `/mcp` to authenticate, all as documented ([Claude Code MCP docs](https://code.claude.com/docs/en/mcp)).
  - Codex: `codex mcp add armin --url <url>` then `codex mcp login armin` ([Codex MCP docs](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)). The docs state no minimum version, so the earlier "needs a recent release" claim was replaced with "if Codex doesn't know the login command, update Codex."
  - Claude and ChatGPT connect from the cloud and need a public HTTPS address. The guide shows a warning for those two when the address is not public HTTPS (it showed here because the dev address is `http://127.0.0.1`), and hides it for a real `https://` address.

## Checks run

| Check | Result |
| --- | --- |
| `pnpm exec vp check` | 0 errors, 59 warnings, none in the new or changed UI files (the same 59 as the baseline; the rest are existing findings) |
| `pnpm exec vp fmt --check` on the four UI files | Formatted |
| `pnpm --filter @armin/web build` | Built; the existing `vite:css-post` sourcemap warning only |
| Impeccable mechanical detector (`impeccable detect --json`) on `agent-settings.tsx`, `agent-permissions.tsx`, `connect-agent.tsx`, `settings-layout.tsx` | No findings |

## Not exercised, and observations

- Query error and loading skeletons were not captured. Skeletons render only while the first query is in flight, which is too brief here to screenshot; the error branches need a failing backend, which wasn't forced.
- The Activity "Show more" control only appears past eight entries; this library never had that many, so it wasn't clicked.
- The mobile app was not touched. No mobile bundle check was run for this change.
- Backend wording, not changed here: activity can read "Created 1 cards and 0 prerequisites".
- Revoked connections stay in the list indefinitely (up to the backend's 100-row cap), so heavy testing pushes the active ones' history down. Active ones always sort first.

## Parent integration follow-up

The parent completed the mobile bundle check and a separate end-to-end callback,
PKCE exchange, MCP SDK authoring, permission, and revocation walkthrough in
[the protocol QA record](2026-10-23-agent-protocol.md). The activity singular/plural
wording was fixed after this UI walkthrough. Connection queries now always include
active grants independently of recent revoked rows, plus up to 50 recent revoked
rows; old revocations cannot hide an active grant. The parent subsequently
exercised the activity expansion after generating more than eight events.
