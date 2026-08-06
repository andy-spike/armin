# Release checklist

Armin releases are published from version tags on `master`. Every release is a
normal GitHub release with one Linux AppImage.

CI runs on PRs into `master`. Create a release tag only after the PR has passed
CI and is merged, so the release workflow packages a known-good commit.

## Distribution

- Linux: AppImage
- Auto-update: deferred

Linux users can manage the AppImage with Gear Lever.

## Toolchain

The release workflow runs entirely on Node 24 (npm 11), including the Forge
publish step. Use the same locally (`.nvmrc` pins Node 24) so `package-lock.json`
stays npm-11 compatible. Avoid regenerating the lockfile under npm 10 (Node 22):
npm 10 drops the `libc` fields npm 11 records, and npm 10's `npm ci` then rejects
an npm-11 lockfile as out of sync around the optional `esbuild@0.28.0` platform
packages.

## Local checks

Run these before opening the PR that will be released:

```bash
npm run icons --workspace apps/desktop
npm run lint
npm run test --workspace apps/desktop
npm run test:mcp --workspace apps/desktop
npm run test:e2e:build --workspace apps/desktop
npm run check:package --workspace apps/desktop
npm run test:e2e --workspace apps/desktop
```

## Versioning

Use a stable semver version, for example `0.5.0`, and create the matching tag
`v0.5.0`.

Include the `package.json` version bump in the PR from `development` to `master`
when possible, so the merged commit and release tag are traceable together.

## Promote development to master

1. Commit WIP directly to `development`, or merge feature branches into
   `development`.
2. When `development` is releasable, update `package.json` to the target version.
3. Open a PR from `development` into `master`.
4. Wait for CI to pass.
5. Merge the PR. `master` is now ready to tag.

## Publish a release

1. Merge the PR containing the version bump into `master`.
2. Create and push the matching tag from `master`:

```bash
git tag v0.5.0
git push origin v0.5.0
```

The tag triggers the release workflow. It builds and uploads the AppImage to a
normal GitHub release.

## Smoke test artifacts

For each artifact downloaded from the GitHub release:

- Launch the app.
- Create a profile.
- Create a deck and card.
- Restart the app and confirm data persists.
- Start a review session.
- Open settings and confirm MCP setup instructions render correctly.

For Linux, also import the AppImage into Gear Lever and confirm it launches from
the desktop entry.
