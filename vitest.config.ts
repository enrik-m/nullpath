/**
 * Vitest config — kept separate from vite.config.ts so the prod build
 * doesn't pull in the test runner.
 *
 * Most tests are pure-logic (XP math, URL safety, length limits, the
 * derived check on achievements) so they don't need DOM. The few that
 * touch React state run in jsdom.
 *
 * Aliases live in `resolve.alias` (not `test.alias`) because they're
 * module-resolution concerns — Vite's resolver runs them before the
 * Vitest-specific transformers see the file:
 *   - sql.js → a tiny stub so tests don't load the WASM binary
 *   - the .wasm ?url import → empty-string.ts so the import resolves
 *     at parse time without trying to fetch the real .wasm asset
 *
 * The db/sqljs client itself is never invoked by the current test
 * suite; the stubs just keep the import graph valid so test files
 * that transitively reach `db/index.ts` don't fail on parse.
 */

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
      {
        // Catches the `?url` query-string suffix Vite adds — a
        // plain-string alias on the bare path wouldn't fire because
        // the resolver compares the full request including the query.
        find: /^sql\.js\/dist\/sql-wasm\.wasm/,
        replacement: path.resolve(__dirname, "src/__mocks__/empty-string.ts"),
      },
      {
        find: /^sql\.js$/,
        replacement: path.resolve(__dirname, "src/__mocks__/sql-js.ts"),
      },
    ],
  },
});
