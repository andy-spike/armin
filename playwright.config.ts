import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "src/e2e",
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "bun run build && bun run start",
    port: 3000,
    reuseExistingServer: true,
  },
});
