import { defineConfig } from "vite-plus";

// Generated code, recorded QA evidence, and vendored skills (hashed in
// skills-lock.json) are never rewritten or linted.
const ignored = [
  ".anki-kit-build/**",
  "**/convex/_generated/**",
  "**/routeTree.gen.ts",
  "apps/web/src/components/brand-paths.ts",
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
      // Read latest values through refs only outside render, and adjust state
      // during render instead of from an effect. A justified exception carries
      // an inline `oxlint-disable-next-line` with its reason.
      "react/refs": "error",
      "react/set-state-in-effect": "error",
      // Only matters to the React Compiler, which this app doesn't use.
      "react/incompatible-library": "off",
      // Dialogs focus their first field on purpose.
      "jsx-a11y/no-autofocus": "off",
      // `role="status"` on a div is as accessible as `<output>`.
      "jsx-a11y/prefer-tag-over-role": "off",
    },
    overrides: [
      {
        // Mutations come from convex/functions.ts, which keeps the derived
        // Browse summaries and deck counters in step with every write.
        files: ["packages/backend/convex/**/*.ts"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: ["./_generated/server", "../_generated/server"].map((name) => ({
                name,
                importNames: ["mutation", "internalMutation"],
                message: "Import mutation builders from convex/functions.ts.",
              })),
            },
          ],
        },
      },
    ],
    ignorePatterns: ignored,
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
