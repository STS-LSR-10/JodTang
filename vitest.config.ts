import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    // DB tests boot a WASM Postgres and run every migration, so give them room
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
