import { defineConfig, devices } from "@playwright/test";

// Light e2e for LIFF pages, at a 360px mobile width.
export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    ...devices["Pixel 5"],
    viewport: { width: 360, height: 740 },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: true },
});
