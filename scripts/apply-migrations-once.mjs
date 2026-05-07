#!/usr/bin/env node
/**
 * One-shot migration applier — runs the three Supabase migrations
 * against a Postgres connection string. Used during initial cloud
 * provisioning when the user doesn't have psql / supabase CLI handy.
 *
 * Usage:
 *   PG_URL="postgresql://..." node scripts/apply-migrations-once.mjs
 *
 * The migrations are idempotent (CREATE TABLE IF NOT EXISTS, ON
 * CONFLICT DO NOTHING) so re-running is safe.
 *
 * NOT a replacement for supabase CLI — once you have it installed,
 * `supabase db push` is the canonical path. This script is a
 * provisioning band-aid, not a deployment tool.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const MIGRATIONS = [
  "supabase/migrations/20260506120000_initial_schema.sql",
  "supabase/migrations/20260506120100_functions.sql",
  "supabase/migrations/20260506120200_seed_web.sql",
];

// Read components individually to avoid URL-encoding issues with
// special characters in the password (`*`, `/`, `.`).
const host = process.env.PG_HOST;
const port = Number(process.env.PG_PORT ?? "5432");
const database = process.env.PG_DATABASE ?? "postgres";
const user = process.env.PG_USER ?? "postgres";
const password = process.env.PG_PASSWORD;
if (!host || !password) {
  console.error("Set PG_HOST, PG_PASSWORD (and optionally PG_PORT, PG_DATABASE, PG_USER).");
  process.exit(1);
}

const client = new pg.Client({
  host,
  port,
  database,
  user,
  password,
  // Supabase requires SSL; self-signed acceptance is safe because we're
  // pinned to a single hostname target.
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("connected");

for (const path of MIGRATIONS) {
  const sql = readFileSync(path, "utf8");
  process.stdout.write(`applying ${path} ... `);
  try {
    await client.query(sql);
    console.log("ok");
  } catch (err) {
    console.error("FAILED");
    console.error(err.message);
    process.exit(1);
  }
}

// Verify counts
const verify = async (table, expected) => {
  const r = await client.query(`SELECT COUNT(*)::int AS n FROM public.${table}`);
  const n = r.rows[0].n;
  const ok = n === expected ? "✓" : "✗";
  console.log(`  ${ok} ${table}: ${n} (expected ${expected})`);
  return n === expected;
};
console.log("verifying:");
const okR = await verify("region", 3);
const okZ = await verify("zone", 23);
const okN = await verify("node_def", 820);
await client.end();

if (!(okR && okZ && okN)) {
  console.error("seed counts wrong");
  process.exit(2);
}
console.log("done");
