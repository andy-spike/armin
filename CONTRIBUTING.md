# Contributing to Armin

Thanks for trying Armin. The project is early and developed by one person, so the
contribution model is intentionally narrow right now.

## What's welcome

**Bug reports and feature requests — yes, please.** They are the most valuable
thing you can send at this stage. Use the [Issues tab][issues]; the templates will
guide you. New issues are labelled `needs-triage` and reviewed from there.

When filing a bug, include:

- Your browser or mobile OS, and whether you used the web app or Expo Go.
- The app version or development commit, when available.
- What you did, what you expected, and what actually happened.
- Whether your data persisted across a restart, if the bug touches study state.

## What's not open yet

**Code pull requests are not being accepted at the moment.** The domain model and
internal contracts are still moving quickly, and unsolicited PRs are likely to
collide with in-flight work. This will change as the project stabilizes; until
then, please open an issue to discuss an idea rather than sending a PR.

If you've found a fix and want to help, describe it in an issue — that's the
fastest way for it to land.

## Licensing of contributions

Armin is licensed under the AGPL-3.0-only (see [LICENSE](LICENSE)), and the Armin
name and logo are covered by [TRADEMARKS.md](TRADEMARKS.md). When code pull
requests open, each contributor will be asked to agree to a contributor license
agreement first, granting the maintainer the right to relicense their
contribution. That keeps the project able to ship the mobile app through app
stores and to offer the code under other terms if needed. Until then, ideas and
fixes described in issues are used under the project's license.

## Reporting a security issue

Do **not** open a public issue for security problems. See [SECURITY.md](SECURITY.md)
for the private reporting process.

## Project layout

Armin is a monorepo with web and mobile clients and a Convex backend. The repository's
conventions and domain language are documented in:

- [`README.md`](README.md) — what Armin is and how to install it.
- [`packages/core/CONTEXT.md`](packages/core/CONTEXT.md) — the study domain glossary.
- [`packages/backend/README.md`](packages/backend/README.md) and the client READMEs cover development and validation.

[issues]: https://github.com/andy-spike/armin/issues
