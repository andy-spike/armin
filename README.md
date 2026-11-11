# Armin

Armin is a spaced-repetition flashcard app for web and mobile. Cards form a
prerequisite graph, and FSRS schedules reviews based on recall.

A card stays **locked** until everything it depends on is learned. Once unlocked,
it stays available even if you later forget a prerequisite; FSRS keeps scheduling
that prerequisite for practice.

Use it at [armincards.app](https://armincards.app). The [user guide](https://docs.armincards.app)
covers reviewing, cards, prerequisites, equations, Anki import, and AI assistants.
Armin is in beta.

## Roadmap

- **Mobile app:** release the Expo client in the App Store and Google Play.
- **Desktop app:** a native app for macOS, Windows, and Linux.
- **Plugin support:** list the [Armin plugin](plugins/armin/README.md) in the
  Claude and ChatGPT plugin directories, and support more assistants.

## Repository

- [`apps/web`](apps/web/README.md): TanStack Start web client.
- [`apps/mobile`](apps/mobile/README.md): Expo mobile client.
- [`apps/docs`](apps/docs/README.md): the user guide, a [Nimbus](https://nimbus-docs.com) site.
- [`packages/backend`](packages/backend/README.md): Convex backend and Better Auth.
- [`packages/core`](packages/core): shared study types and rules.
- [`plugins/armin`](plugins/armin/README.md): the Armin plugin for Claude and ChatGPT.

## Development

Install the [Vite+](https://viteplus.dev) CLI once. It selects the Node and pnpm
versions the repo pins:

```bash
curl -fsSL https://vite.plus | bash   # Windows: irm https://vite.plus/ps1 | iex
```

Then, from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm dev:setup  # create a local Convex deployment, push, seed, write client URLs
pnpm dev        # web at http://localhost:3000 + local Convex backend
```

Development uses a local Convex deployment, so you need no Convex login. Setup
seeds a sample account, `test@example.com` / `armin1234`. For real email or Google
sign-in, set the [backend variables](packages/backend/README.md#deployment-environment-variables).

Run these from the root, each in its own terminal:

| Command            | Starts                                    |
| ------------------ | ----------------------------------------- |
| `pnpm dev:mobile`  | Expo Go with a LAN QR code on port 8081   |
| `pnpm dev:android` | Expo Go on the Android emulator or device |
| `pnpm dev:ios`     | Expo Go on the iOS simulator (macOS only) |
| `pnpm dev:web`     | Web client only, port 3000                |
| `pnpm dev:backend` | Local Convex backend only                 |
| `pnpm dev:docs`    | User guide only, port 4321                |

Mobile needs `pnpm dev` running. See [mobile setup](apps/mobile/README.md).

Run `pnpm check` before finishing (format, lint, and type checks for every
workspace; `pnpm format` fixes formatting). Also run `pnpm --filter @armin/web build`
and `pnpm --filter @armin/mobile check:bundle`, and for the docs site
`pnpm --filter @armin/docs typecheck` and `pnpm --filter @armin/docs build`.
There are no automated test suites.

Work on a task branch and open a PR against `master`; the `Verify` check must
pass. Merging doesn't deploy. Agents have skills for
[worktree setup](.agents/skills/setting-up-worktrees/SKILL.md) and
[production deploys](.agents/skills/deploying-to-cloudflare/SKILL.md).

## Self-hosting

You can run a private instance with Docker, as-is with no warranty or support.
See the [self-hosting guide](https://docs.armincards.app/guides/self-hosting/).

## AI assistants

Armin works with ChatGPT, Claude, Gemini, Claude Code, Codex, and other MCP
clients. See [publishing the plugin](plugins/PUBLISHING.md) and the
[MCP server reference](https://docs.armincards.app/reference/mcp-server/).

The `writing-study-cards` skill teaches agents how to write good cards, distilled
from Andy Matuschak's [How to write good prompts](https://andymatuschak.org/prompts/).
Install it with:

```bash
npx skills add andy-spike/armin --skill writing-study-cards
```

The [Armin plugin](plugins/armin/README.md) bundles the same skill. Keep the two
copies identical; `pnpm plugin:package` fails if they differ.

## License and contributing

Copyright © 2026 Andy Spike. Armin is free software under the
[MIT License](LICENSE). The Armin name and logo are not covered by it; see
[TRADEMARKS.md](TRADEMARKS.md).

Armin accepts issues only, not pull requests. Report bugs and feature requests in
[GitHub Issues](https://github.com/andy-spike/armin/issues). See
[CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
