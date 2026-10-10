// vitest 4 needs vite >= 6, but Electron Forge's Vite plugin keeps the desktop
// build on vite 5. vitest declares vite as a peer, so pnpm would hand it the
// desktop's vite 5. Turn that peer into vitest's own pinned dependency, which
// reproduces the nested install npm used to make.
const VITEST_VITE = "8.0.16";

function readPackage(pkg) {
  if (pkg.name === "vitest" || pkg.name === "@vitest/mocker") {
    if (pkg.peerDependencies?.vite) {
      delete pkg.peerDependencies.vite;
      if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.vite;
      pkg.dependencies = { ...pkg.dependencies, vite: VITEST_VITE };
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
