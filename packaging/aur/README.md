# AUR package: `armin-bin`

> **Status: not published yet.** AUR account registration is currently closed,
> so the one-time setup below cannot be completed. The package goes live with
> the first release tagged after registration reopens and the
> `AUR_SSH_PRIVATE_KEY` secret is configured. Until then, the `aur` job in the
> Release workflow skips itself with a notice.

Armin is distributed on the Arch User Repository as `armin-bin`. The package
repackages the official Linux AppImage from GitHub Releases; it does not build
from source.

- Package page: https://aur.archlinux.org/packages/armin-bin
- AUR git repo: `ssh://aur@aur.archlinux.org/armin-bin.git`

## Files

- `PKGBUILD` — the package recipe. This copy is the template; the release
  workflow rewrites `pkgver` and `sha256sums` on every tag and pushes the
  result to the AUR git repo. Do not edit the AUR copy by hand.
- `.SRCINFO` — generated with `makepkg --printsrcinfo`. The release workflow
  regenerates it after rewriting the `PKGBUILD`.
- `armin.desktop` — desktop entry installed by the package.

## Design notes

- The AppImage is self-extracted with `--appimage-extract` at build time, so
  the installed package needs neither `libfuse2` nor any AppImage runtime.
- The bundled `armin-launch` wrapper is dropped. It hardcodes `--no-sandbox`,
  which is only needed when the app runs from a FUSE mount (`nosuid`). From a
  regular directory, Chromium's user-namespace sandbox works without the
  setuid helper, so `/usr/bin/armin` symlinks to the real binary and the
  sandbox stays enabled.

## One-time setup

Blocked until AUR registration reopens. When it does:

1. Create an AUR account: https://aur.archlinux.org/register/
2. Generate a dedicated SSH key pair and upload the public key to the AUR
   account ("My Packages → Edit → SSH Public Key", or the account settings
   page):

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/aur_armin -C "armin release automation"
   ```

3. Add the private key as the GitHub repository secret
   `AUR_SSH_PRIVATE_KEY` (full contents of `~/.ssh/aur_armin`, including the
   `BEGIN`/`END` lines).

No manual AUR-side creation is needed: pushing to a nonexistent package name
creates the package.

## Per-release flow

Nothing to do by hand. When a `v*` tag triggers the Release workflow, the
`aur` job (`.github/workflows/release.yml`):

1. Waits for all publish jobs to finish.
2. Reads the version from `apps/desktop/package.json`.
3. Downloads the `Armin-<version>-x64.AppImage` release asset and computes
   its SHA-256.
4. Rewrites `pkgver`, resets `pkgrel` to 1, and updates `sha256sums` in the
   `PKGBUILD`.
5. Regenerates `.SRCINFO` inside an `archlinux` container.
6. Commits and pushes `PKGBUILD`, `.SRCINFO`, and `armin.desktop` to the AUR
   git repo.

If the `AUR_SSH_PRIVATE_KEY` secret is missing, the job logs a notice and
succeeds without pushing, so releases are never blocked.

## Local test

On an Arch machine with `base-devel` installed:

```bash
cd packaging/aur
makepkg -f          # downloads the AppImage and builds armin-bin-*.pkg.tar.zst
pacman -Qlp armin-bin-*.pkg.tar.zst
```
