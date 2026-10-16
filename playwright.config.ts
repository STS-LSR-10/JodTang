import { defineConfig, devices } from "@playwright/test";

/**
 * Light e2e for the LIFF pages at a 360px phone width. The API is mocked per test
 * (page.route), and the app is built with NEXT_PUBLIC_E2E=1 so the LINE sign-in screen is
 * skipped. Run: `pnpm e2e`  (set E2E_BASE_URL to test an already running deployment instead —
 * note that mode needs the same mock flag, so use it for local servers only).
 */
const PORT = 3100;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const NEXT = "node ./node_modules/next/dist/bin/next";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    ...devices["Pixel 5"],
    viewport: { width: 360, height: 740 },
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `${NEXT} build && ${NEXT} start -p ${PORT}`,
        url: BASE_URL,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        env: {
          NEXT_PUBLIC_E2E: "1",
          NEXT_PUBLIC_LIFF_ID: "e2e-liff-id",
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e",
          APP_BASE_URL: BASE_URL,
        },
      },
});
