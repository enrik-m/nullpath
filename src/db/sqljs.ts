/**
 * Browser SQLite via sql.js (SQLite compiled to WASM) with IndexedDB
 * persistence. Replaces `@tauri-apps/plugin-sql` from the desktop
 * version while preserving the exact `.select<T>()` / `.execute()`
 * interface — `db/index.ts` doesn't change.
 *
 * Lifecycle:
 *   1. On first call to `getDatabase()`, dynamically load sql.js +
 *      its WASM, then either restore the SQLite file from IndexedDB
 *      or run the migration sequence on a fresh DB.
 *   2. Every successful `execute()` schedules a debounced
 *      `persistToIdb()` so the IndexedDB snapshot tracks state
 *      without thrashing the disk on hot writes.
 *   3. `beforeunload` flushes any pending save synchronously to
 *      catch the user closing the tab between writes.
 *
 * Why sql.js + IndexedDB and not Dexie / native IndexedDB? Because
 * the existing data layer is ~70 SQL queries with joins, parameter
 * binding, FK cascades, partial indexes — rewriting all of that for
 * a key-value store would be a multi-day rewrite of the data layer
 * for zero functional gain. The WASM bundle is ~1MB cached on first
 * load; subsequent loads are instant.
 */

import { get as idbGet, set as idbSet } from "idb-keyval";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

import { runMigrations } from "./migrations";

/**
 * URL of the SQLite WASM payload. Lives in `public/` so Vite serves
 * it as a static asset at a stable, hashable URL — both in dev
 * (Vite's static handler) and in prod (Vercel's CDN). The
 * `?url`-from-node_modules approach is unreliable across Vite
 * versions; the public/ pattern is the canonical sql.js + Vite
 * setup.
 *
 * `BASE_URL` honors any base path the build is mounted under (root
 * `/` by default). We prepend the leading slash explicitly so a
 * trailing slash in `BASE_URL` doesn't double up.
 */
const SQL_WASM_URL = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/sql-wasm.wasm`;

/** IndexedDB key under which the serialized SQLite file is stored. */
const IDB_KEY = "nullpath:db:v1";
/** Debounce window for "save to IndexedDB after writes". */
const PERSIST_DEBOUNCE_MS = 500;

/** Result shape that mirrors the Tauri SQL plugin's `execute()`. */
export interface ExecuteResult {
  lastInsertId: number;
  rowsAffected: number;
}

/** A `select<T>()` / `execute()` pair compatible with the desktop API. */
export interface SqlJsClient {
  select<T>(sql: string, args?: unknown[]): Promise<T>;
  execute(sql: string, args?: unknown[]): Promise<ExecuteResult>;
}

let sqlJs: SqlJsStatic | null = null;
let database: Database | null = null;
let clientPromise: Promise<SqlJsClient> | null = null;
let saveTimer: number | null = null;

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (sqlJs) return sqlJs;
  // sql.js's `locateFile` callback gets the bare filename
  // ("sql-wasm.wasm") and is expected to return the absolute URL
  // we want it fetched from. `SQL_WASM_URL` resolves to the file we
  // copied into public/ at predev/prebuild time.
  sqlJs = await initSqlJs({ locateFile: () => SQL_WASM_URL });
  return sqlJs;
}

async function loadFromIdb(): Promise<Uint8Array | null> {
  const raw = await idbGet(IDB_KEY);
  if (raw instanceof Uint8Array) return raw;
  // Older browsers / fallback: `idb-keyval` may surface as an
  // ArrayBuffer or even a typed array of a different kind.
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  return null;
}

async function persistToIdb(): Promise<void> {
  if (!database) return;
  const bytes = database.export();
  await idbSet(IDB_KEY, bytes);
}

function scheduleSave(): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void persistToIdb();
  }, PERSIST_DEBOUNCE_MS);
}

/**
 * Synchronous flush, used by the `beforeunload` listener so a tab
 * close between writes doesn't lose the most recent changes.
 * Note: IndexedDB writes are still async, but we kick them off
 * before the page tears down.
 */
function flushPendingSave(): void {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (database) {
    void idbSet(IDB_KEY, database.export());
  }
}

/**
 * Bind positional `args` (matching the `$1`, `$2` style of the
 * desktop SQL plugin) onto a sql.js prepared statement. sql.js itself
 * also accepts `?` and `:name` style; we pass the raw array which
 * works with both `$N` and `?` schemes.
 */
function makeClient(db: Database): SqlJsClient {
  return {
    async select<T>(sql: string, args: unknown[] = []): Promise<T> {
      const stmt = db.prepare(sql);
      try {
        if (args.length > 0) stmt.bind(args as never);
        const rows: Record<string, unknown>[] = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as Record<string, unknown>);
        }
        return rows as unknown as T;
      } finally {
        stmt.free();
      }
    },

    async execute(sql: string, args: unknown[] = []): Promise<ExecuteResult> {
      // Use prepare/run to mirror parameter binding; for multi-statement
      // SQL (migrations) `db.run` handles the whole thing.
      const stmt = db.prepare(sql);
      try {
        if (args.length > 0) stmt.bind(args as never);
        stmt.step();
      } finally {
        stmt.free();
      }
      // sql.js doesn't expose lastInsertRowid directly on Database in
      // the public typings, but it's available via the `db.exec` SQL.
      const lastIdRows = db.exec("SELECT last_insert_rowid() AS id");
      const lastInsertId = Number(lastIdRows[0]?.values?.[0]?.[0] ?? 0);
      const rowsAffected = db.getRowsModified();
      scheduleSave();
      return { lastInsertId, rowsAffected };
    },
  };
}

/**
 * Lazy singleton — first caller drives the WASM load + migration
 * sequence; everyone else awaits the same promise. Subsequent calls
 * after init return immediately.
 */
export async function getDatabase(): Promise<SqlJsClient> {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const SQL = await loadSqlJs();
    const existing = await loadFromIdb();
    database = existing ? new SQL.Database(existing) : new SQL.Database();

    // Run the migration sequence. On a restored DB, only pending
    // versions apply (the runner reads `_migrations` to decide).
    await runMigrations(database);
    // Persist the post-migration state immediately on a fresh DB so
    // the next page load doesn't redo the seed.
    if (!existing) await persistToIdb();

    // Best-effort flush on tab close.
    window.addEventListener("beforeunload", flushPendingSave);

    return makeClient(database);
  })();

  return clientPromise;
}
