import { defineConfig, loadEnv, lazyPlugins } from "vite-plus";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@tanstack/redact/cloudflare";
import { redact } from "@tanstack/redact/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "ARMIN_");
  const node = mode === "node";
  return {
    server: {
      port: Number(process.env.ARMIN_WEB_PORT ?? env.ARMIN_WEB_PORT ?? 3000),
      strictPort: true,
    },
    resolve: { tsconfigPaths: true },
    ssr: {
      noExternal: true,
    },
    plugins: lazyPlugins(async () => [
      tailwindcss(),
      ...(node ? [] : [await cloudflare({ viteEnvironment: { name: "ssr" } })]),
      tanstackStart(),
      react(),
      redact(),
    ]),
  };
});
