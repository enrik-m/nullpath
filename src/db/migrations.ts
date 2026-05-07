/**
 * Migration runner for the local sql.js path: maintains a
 * `_migrations` table with the highest-applied version and applies
 * each pending migration in order on startup.
 *
 * The migration files themselves are imported as raw strings via
 * Vite's `?raw` suffix and live under src/db/migrations/.
 */

import type { Database } from "sql.js";

import m001 from "./migrations/001_initial_schema.sql?raw";
import m002 from "./migrations/002_seed_web.sql?raw";
import m003 from "./migrations/003_bounties.sql?raw";
import m004 from "./migrations/004_repetition.sql?raw";
import m005 from "./migrations/005_drop_session_tracking.sql?raw";

interface Migration {
  version: number;
  description: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  { version: 1, description: "initial schema", sql: m001 },
  { version: 2, description: "seed web region", sql: m002 },
  { version: 3, description: "bounty submission ledger", sql: m003 },
  { version: 4, description: "spaced repetition queue", sql: m004 },
  { version: 5, description: "drop session tracking", sql: m005 },
];

export async function runMigrations(db: Database): Promise<void> {
  // Bookkeeping table — created if missing on every run.
  db.run(
    `CREATE TABLE IF NOT EXISTS _migrations (
       version INTEGER PRIMARY KEY,
       description TEXT NOT NULL,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  );

  const result = db.exec("SELECT MAX(version) AS v FROM _migrations");
  const currentRaw = result[0]?.values?.[0]?.[0];
  const currentVersion = typeof currentRaw === "number" ? currentRaw : 0;

  for (const m of MIGRATIONS) {
    if (m.version <= currentVersion) continue;
    // Each migration runs in a transaction so a partial failure
    // doesn't half-apply.
    db.run("BEGIN TRANSACTION");
    try {
      db.run(m.sql);
      db.run("INSERT INTO _migrations (version, description) VALUES ($v, $d)", {
        $v: m.version,
        $d: m.description,
      });
      db.run("COMMIT");
    } catch (err) {
      db.run("ROLLBACK");
      throw new Error(`Migration ${m.version} (${m.description}) failed`, { cause: err });
    }
  }
}
