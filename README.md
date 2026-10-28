# Armin

Armin is a spaced-repetition flashcard app for web and mobile. Cards form a
prerequisite graph, and FSRS schedules reviews based on recall performance.

## Why it exists

Most flashcard apps treat every card as an independent atom of knowledge, meaning all cards always live in the same level of abstraction. In practice,
knowledge is a graph: some things are prerequisites for others. Armin makes that
structure explicit. A card stays **locked** until everything it depends on has been
learned, so you build foundations before tackling what sits on top of them. Once
unlocked, a card stays accessible even if a prerequisite is later forgotten;
FSRS continues scheduling that prerequisite for practice.

## Applications and shared code

- [`apps/web`](apps/web/README.md): TanStack Start web client.
- [`apps/mobile`](apps/mobile/README.md): Expo mobile client for the same backend.
- [`packages/backend`](packages/backend/README.md): Convex backend and Better Auth,
  with account-owned libraries, server-side scheduling, images, and ZIP export.
- [`packages/core`](packages/core): portable study types and rules.

The web app deploys to [armincards.app](https://armincards.app) on Cloudflare
Workers, with its backend on Convex cloud. The Electron
desktop app, its local MCP server, and the old sync service have been retired.
Their source and release tooling remain available in Git history.

## Development

The toolchain is [Vite+](https://viteplus.dev) (`vp`). Install its global CLI
once; it selects the Node version pinned in `.node-version` and the pnpm version
pinned in `package.json`:

```bash
curl -fsSL https://vite.plus | bash   # Windows: irm https://vite.plus/ps1 | iex
```

Quick start from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm dev:setup  # create a local Convex deployment, push, seed, write client URLs
pnpm dev        # web at http://localhost:3000 + local Convex backend
```

Development runs a **local Convex deployment** on this machine (Convex's
open-source backend, started by `convex dev`); no Convex login or cloud dev
deployment is needed. Production stays on Convex cloud. Setup sets `SITE_URL`,
the Expo trusted origins, and a session secret, and seeds a sample account
(`test@example.com` / `armin1234`). For real email or Google sign-in, set the
variables in [the backend README](packages/backend/README.md#deployment-environment-variables)
on the local deployment. Data lives in `packages/backend/.convex/local/`.

`dev:setup` refreshes only the Convex URL entries in the web and mobile
`.env.local` files, preserving other settings. To refresh those URLs without
pushing backend code, run `pnpm --filter @armin/backend dev:clients`.

Additional commands, each run from the root in its own terminal:

| Command            | Starts                                              |
| ------------------ | --------------------------------------------------- |
| `pnpm dev:mobile`  | Expo Go with a LAN QR code on port 8081             |
| `pnpm dev:android` | Expo Go and opens the Android emulator/device       |
| `pnpm dev:ios`     | Expo Go and opens the iOS simulator, requires macOS |
| `pnpm dev:web`     | Web client only, port 3000                          |
| `pnpm dev:backend` | Local Convex backend and watcher only               |

Keep `pnpm dev` running when using mobile; the local backend only runs while it
does. Mobile URLs use this machine's LAN address, so a phone on the same network
can connect; a phone that cannot reach this machine needs a cloud deployment.
Sign into mobile with the sample account or one created in the web app.
See [mobile setup](apps/mobile/README.md) for Expo Go, emulator, and networking
requirements. Stop each command with Ctrl+C; it stops both watchers started by
`pnpm dev`.

Make every repository change on a task branch in a T3 Code worktree, then open a
PR against `master`. GitHub requires the PR's `Verify` check to pass with the branch
up to date before merging, including for administrators. Direct pushes, force
pushes, and deletion of `master` are blocked. See
[agent worktree setup](docs/dev-worktrees.md) for isolated development environments.

`master` is the release source. Merging a PR does not deploy; deploy the
backend and web app from `master` as described in
[production deployment](docs/deploy-cloudflare.md).

## Importing from Anki

Settings → Data → Import, or **Import from Anki** on the deck list, offers two
routes.

**Recommended: import with an AI assistant.** A connected assistant receives
the Anki file, downloads Armin's versioned converter kit, and runs it in its own
sandbox. The kit uses the same deterministic converter and file reader as the
browser, extracts supported images, and reports warnings and unresolved notes.
The assistant stages the result, shows a final preview, and saves only after you
approve it. Large or image-heavy decks benefit most: unsupported cards can be
repaired on request, or explicitly skipped with a reason. MCP imports always
start fresh, with no Anki due dates or review history. The route needs an
assistant with file access and a sandbox that can run Node.js 20, 22, or 24; chat
clients without those capabilities should use browser import.

**Browser import** remains directly available and unchanged. It brings in Anki
decks (`.apkg`), whole collections (`.colpkg`, from Anki 2.1 through current
releases), and plain-text exports (`.txt`, `.csv`, `.tsv`). Each Anki deck
becomes an Armin deck; Basic, reversed, typed-answer, Cloze, and Image Occlusion
notes map to the matching Armin card types, and other note types are rendered
from their templates. Images and, optionally, review progress come along; audio
and video don't. The file is read in the browser and the preview lists anything
left out before importing. See
[ADR 0022](packages/core/docs/adr/0022-anki-import-runs-in-the-browser.md) and
[AI assistant Anki import](docs/agent-connections.md#anki-import).

## Equations

Cards support KaTeX mathematics: `\(x^2\)` or `$x^2$` inline, and
`\[\frac{a}{b}\]` or `$$\frac{a}{b}$$` for display equations. Chemistry uses
`\ce{H2O}` inside math delimiters. Use **Edit source** in the card editor to
write equations. The Milkdown Crepe editor supports inline dollar math and
standalone display equations visually. Legacy equation delimiters, display math
inside tables/lists/prose, fenced LaTeX samples, and currency text open as source
to preserve their structure. Source fields with equations include a rendered preview. Code spans and fenced code
stay literal. Unsupported commands retain their source with a warning.

Anki MathJax delimiters and the legacy `[$]` / `[$$]` math wrappers are converted
without Markdown escaping. Legacy `[latex]` documents remain source with a
preview warning; arbitrary LaTeX packages and document compilation are not
supported. The web app renders equations with KaTeX and bundled fonts.

## AI assistant connections

Armin works with ChatGPT, Claude, Gemini, Claude Code, Codex, and other MCP
clients through Armin sign-in.
Chat app users install the [Armin plugin](plugins/armin/README.md) from Claude's
or ChatGPT's plugin directory; coding agents connect to Armin's hosted MCP
server directly. **AI setup** in the sidebar shows step-by-step instructions for
each, including a prompt that lets a coding agent set itself up; Settings → AI
assistants lists connections. After you
approve a connection, its assistant can use Armin authoring and import tools on your whole
library: reading, creating, editing, archiving, moving, and linking cards, plus
creating and renaming decks, across every deck, including decks you add later.
Ordinary authoring is text-only; Anki imports have a scoped image-upload route.
It cannot permanently delete content, rate reviews, change
scheduling, export your library, or manage your account. You can disconnect any
assistant at any time.

See [AI assistant connections](docs/agent-connections.md) for the access model,
OAuth/MCP endpoints, operation limits, and deployment verification needs, and
[publishing the plugin](plugins/PUBLISHING.md) for directory submission.
Provider account restrictions apply.

## Card-writing skill

Agents need guidance on how to structure flashcard content — how to chunk a topic, what belongs in a single card, or how cards
should depend on each other. The `writing-study-cards` skill provides those
guidelines, distilled from Andy Matuschak's
[How to write good prompts](https://andymatuschak.org/prompts/). Install it so your
agent applies them automatically whenever it generates cards.

The skill lives in [`.agents/skills/writing-study-cards`](.agents/skills/writing-study-cards)
and installs with the [`skills` CLI](https://www.skills.sh/docs):

```bash
# Install into the current project (auto-detects your agent)
npx skills add andy-spike/armin --skill writing-study-cards

# Or install globally so it's available across all projects
npx skills add andy-spike/armin --skill writing-study-cards --global
```

You can target a specific agent (for example Cursor, Claude Code, or Codex) with
`-a`, and preview what's available without installing using `--list`:

```bash
npx skills add andy-spike/armin --list
npx skills add andy-spike/armin --skill writing-study-cards -a cursor
```

The `skills` CLI discovers skills under `.agents/skills/`, so it picks up
`writing-study-cards` directly from this repository.

The [Armin plugin](plugins/armin/README.md) bundles the same skill, so chat app
and plugin users already have it. Keep the two copies identical;
`pnpm plugin:package` fails if they differ.

## Validation

Run `pnpm check`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle`. `pnpm check` runs `vp check`, which
checks formatting (Oxfmt), lints (Oxlint), and type checks every workspace in one
pass; `pnpm format` fixes formatting. Lint and format settings live in the root
`vite.config.ts` ([ADR 0003](docs/adr/0003-vite-plus-toolchain.md)). Web, backend,
and mobile changes use running-app walkthroughs recorded in [`docs/qa/`](docs/qa/),
without automated test suites.

## Contributions

Report bugs and feature requests in [GitHub Issues](https://github.com/andy-spike/armin/issues).
Code pull requests are not being accepted while the domain contracts stabilize.
See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[the code of conduct](CODE_OF_CONDUCT.md).
