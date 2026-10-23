import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
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
      // The Better Auth component ships ESM that must be bundled for SSR.
      noExternal: ["@convex-dev/better-auth"],
    },
    plugins: [
      tailwindcss(),
      // Builds and runs the server on Cloudflare Workers (see wrangler.jsonc).
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tanstackStart(),
      react(),
    ],
  };
});
