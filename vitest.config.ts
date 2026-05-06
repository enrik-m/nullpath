/**
 * Vitest config — kept separate from vite.config.ts so the prod build
 * doesn't pull in the test runner.
 *
 * Most tests are pure-logic (XP math, URL safety, length limits, the
 * derived check on achievements) so they don't need DOM or Tauri
 * mocks. The few that touch React state run in jsdom.
 */

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    // The store and a few helpers import from "@tauri-apps/plugin-sql"
    // and "@tauri-apps/plugin-opener" at module load. We don't want to
    // run real Tauri code in tests; alias them to lightweight mocks.
    alias: {
      "@tauri-apps/plugin-sql": path.resolve(
        __dirname,
        "src/__mocks__/tauri-plugin-sql.ts",
      ),
      "@tauri-apps/plugin-opener": path.resolve(
        __dirname,
        "src/__mocks__/tauri-plugin-opener.ts",
      ),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
