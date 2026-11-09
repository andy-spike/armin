/// <reference types="astro/client" />

// The repo-wide type-aware lint (`pnpm check`) runs plain TypeScript, which
// can't read .astro files. `astro check` still type-checks them for real.
declare module "*.astro" {
  const component: import("astro/runtime/server/index.js").AstroComponentFactory;
  export default component;
}
