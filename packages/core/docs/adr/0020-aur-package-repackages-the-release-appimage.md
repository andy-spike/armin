# The AUR package repackages the release AppImage

Armin is distributed on the Arch User Repository as `armin-bin`. The PKGBUILD
downloads the `Armin-<version>-x64.AppImage` asset from the matching GitHub
release, self-extracts it with `--appimage-extract`, and installs the shipped
FHS tree (`/usr/lib/armin`, desktop entry, hicolor icon, `/usr/bin/armin`
symlink). The release workflow rewrites `pkgver`/`sha256sums` on every tag and
pushes the updated PKGBUILD, `.SRCINFO`, and desktop file to the AUR git repo
with a dedicated SSH key. The template lives in `packaging/aur/` at the repo
root; the AUR copy is machine-written and never edited by hand.

We repackage the AppImage instead of building from source because the Linux
artifact is already the supported, smoke-tested distribution surface, and a
source package would force every installer to download Electron and rebuild
`better-sqlite3` against the Electron ABI for no functional gain (the AppImage
build is not reproducible in a makepkg chroot by design). We extract rather
than ship the AppImage whole so the installed package needs neither `libfuse2`
nor any AppImage runtime — plain pacman dependencies cover it. The bundled
`armin-launch` wrapper is dropped: its hardcoded `--no-sandbox` exists only for
FUSE (`nosuid`) mounts, while an installed copy runs Chromium's user-namespace
sandbox without the setuid helper, which `fakeroot`-built packages cannot ship
anyway.

Revisit if the project wants a source-built `armin-git` package, moves to a
system Electron (shared `electron` package) to shrink downloads, or the release
artifact set changes shape enough that repackaging the AppImage stops being
the cheapest trusted path.
