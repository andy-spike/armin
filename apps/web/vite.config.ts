import { defineConfig, loadEnv, lazyPlugins } from "vite-plus";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
// Redact's copy of @cloudflare/vite-plugin 1.65.0 fixes its development module
// runner for the Redact runtime; production Worker output is unchanged.
import { cloudflare } from "@tanstack/redact/cloudflare";
import { redact } from "@tanstack/redact/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "ARMIN_");
  return {
    server: {
      port: Number(process.env.ARMIN_WEB_PORT ?? env.ARMIN_WEB_PORT ?? 3000),
      strictPort: true,
    },
    resolve: { tsconfigPaths: true },
    ssr: {
      // Redact redirects React imports, so server dependencies must be bundled.
      noExternal: true,
    },
    plugins: lazyPlugins(async () => [
      tailwindcss(),
      // Builds and runs the server on Cloudflare Workers (see wrangler.jsonc).
      await cloudflare({ viteEnvironment: { name: "ssr" } }),
      tanstackStart(),
      react(),
      // Swaps React and React DOM for the smaller synchronous Redact runtime.
      redact(),
    ]),
  };
});
