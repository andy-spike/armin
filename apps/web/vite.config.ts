import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: { port: 3000, strictPort: true },
  resolve: { tsconfigPaths: true },
  ssr: {
    // The Better Auth component ships ESM that must be bundled for SSR.
    noExternal: ["@convex-dev/better-auth"],
  },
  plugins: [tailwindcss(), tanstackStart(), react()],
});
