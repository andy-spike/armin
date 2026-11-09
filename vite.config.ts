import { defineConfig } from "vite-plus";

const ignored = [
  ".anki-kit-build/**",
  "**/convex/_generated/**",
  "**/routeTree.gen.ts",
  "apps/web/src/components/brand-paths.ts",
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
      "react/refs": "error",
      "react/set-state-in-effect": "error",
      "react/incompatible-library": "off",
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/prefer-tag-over-role": "off",
    },
    overrides: [
      {
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
