#!/usr/bin/env node
/**
 * build-seed-cloud — translate the SQLite seed into a Postgres-dialect
 * seed for the cloud-mode database.
 *
 * Reads:  src/db/migrations/002_seed_web.sql       (SQLite)
 * Writes: supabase/migrations/20260506120200_seed_web.sql (Postgres)
 *
 * Transformations (small + safe):
 *   1. `INSERT OR IGNORE INTO node (...)`   →
 *      `INSERT INTO node_def (...)`   (table rename)
 *   2. `INSERT OR IGNORE INTO region|zone|node_def (...) VALUES ... ;`
 *      → append `ON CONFLICT (id) DO NOTHING` before the trailing `;`
 *   3. Header comment retitled to make clear it's the Postgres flavor.
 *
 * Run via `npm run seed:build:cloud`. Re-run after `npm run seed:build`
 * if the SQLite source changed.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SOURCE = "src/db/migrations/002_seed_web.sql";
const TARGET = "supabase/migrations/20260506120200_seed_web.sql";

function translate(sqlite) {
  let s = sqlite;

  // 1. Rename `node` table → `node_def`. The seed only references it
  //    as `INSERT OR IGNORE INTO node (...)` so a precise replacement
  //    is safe.
  s = s.replace(
    /INSERT OR IGNORE INTO node \(/g,
    "INSERT OR IGNORE INTO node_def (",
  );

  // 2. Convert "INSERT OR IGNORE INTO X (...) VALUES ...;" into
  //    "INSERT INTO X (...) VALUES ... ON CONFLICT (id) DO NOTHING;".
  //    The seed always batches with multi-row VALUES followed by a
  //    single trailing `;` — we anchor on the `;` that ends each
  //    statement to insert the ON CONFLICT clause. Multi-line
  //    matching is on so the clause can span hundreds of rows.
  s = s.replace(
    /INSERT OR IGNORE INTO (region|zone|node_def) \(([^)]+)\) VALUES([\s\S]*?);(?=\s*(?:--|$|\n))/g,
    (_match, table, cols, body) =>
      `INSERT INTO ${table} (${cols}) VALUES${body}\nON CONFLICT (id) DO NOTHING;`,
  );

  // 3. Retitle the header comment — keep the auto-generated marker
  //    so a reader knows not to hand-edit, but make the dialect
  //    explicit.
  s = s.replace(
    /^-- Nullpath — Web Pentesting region seed.*$/m,
    "-- Nullpath — Web Pentesting region seed (Postgres / cloud mode)",
  );
  s = s.replace(
    /^-- Auto-generated from plans\/web-pentesting\.md by scripts\/build-seed\.mjs\..*$/m,
    "-- Auto-generated from src/db/migrations/002_seed_web.sql by\n-- scripts/build-seed-cloud.mjs. Do not edit by hand — re-run\n-- `npm run seed:build:cloud` after the SQLite source changes.",
  );

  // 4. SQLite-only "no BEGIN/COMMIT" comment doesn't apply to Postgres.
  //    Replace it with a Postgres-relevant note.
  s = s.replace(
    /-- IMPORTANT: no BEGIN\/COMMIT here.*?\n.*?-- transaction, and a nested BEGIN errors silently in the SQL plugin\.\n/s,
    "-- Apply via Supabase SQL Editor (paste + Run) or `supabase db push`.\n-- Idempotent: every INSERT uses ON CONFLICT (id) DO NOTHING.\n",
  );

  return s;
}

const sqlite = readFileSync(SOURCE, "utf8");
const postgres = translate(sqlite);

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, postgres);

const lines = postgres.split("\n").length;
const inserts = (postgres.match(/INSERT INTO/g) ?? []).length;
console.log(
  `[build-seed-cloud] ${SOURCE} → ${TARGET} (${lines} lines, ${inserts} inserts)`,
);
