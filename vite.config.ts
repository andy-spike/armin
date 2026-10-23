import { defineConfig } from "vite-plus";

// Generated code, recorded QA evidence, and vendored skills (hashed in
// skills-lock.json) are never rewritten or linted.
const ignored = [
  "**/convex/_generated/**",
  "**/routeTree.gen.ts",
  "docs/qa/**",
  ".agents/**",
  ".claude/**",
  "skills-lock.json",
];

export default defineConfig({
  fmt: {
    ignorePatterns: ignored,
  },
  lint: {
    plugins: ["eslint", "typescript", "import", "unicorn", "oxc", "react", "jsx-a11y"],
    categories: { correctness: "error" },
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      // Render-time ref access and effect-driven state resets are tracked
      // for a follow-up refactor; they become errors once fixed.
      "react/refs": "warn",
      "react/set-state-in-effect": "warn",
      // Only matters to the React Compiler, which this app doesn't use.
      "react/incompatible-library": "off",
      // Dialogs focus their first field on purpose.
      "jsx-a11y/no-autofocus": "off",
      // `role="status"` on a div is as accessible as `<output>`.
      "jsx-a11y/prefer-tag-over-role": "off",
    },
    ignorePatterns: ignored,
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
