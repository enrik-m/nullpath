/**
 * Vitest stub for `sql.js`. The real package is a SQLite WASM build
 * that we don't want to instantiate inside tests — none of the
 * current test suite exercises the actual db layer.
 *
 * Returns an inert `initSqlJs` whose Database has no-op methods. If
 * future tests need real SQL execution, swap to better-sqlite3 or
 * import the real `sql.js` (jsdom can run it, just slowly).
 */

interface FakeDatabase {
  run(): void;
  exec(): { columns: string[]; values: unknown[][] }[];
  prepare(): {
    bind(): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  };
  export(): Uint8Array;
  getRowsModified(): number;
  close(): void;
}

function makeFakeDb(): FakeDatabase {
  return {
    run: () => {},
    exec: () => [],
    prepare: () => ({
      bind: () => true,
      step: () => false,
      getAsObject: () => ({}),
      free: () => {},
    }),
    export: () => new Uint8Array(0),
    getRowsModified: () => 0,
    close: () => {},
  };
}

export default async function initSqlJs(): Promise<{
  Database: new () => FakeDatabase;
}> {
  return {
    Database: function (): FakeDatabase {
      return makeFakeDb();
    } as unknown as new () => FakeDatabase,
  };
}

// Type re-exports so `import type { Database, SqlJsStatic } from "sql.js"`
// keeps resolving in the test build.
export type Database = FakeDatabase;
export type SqlJsStatic = { Database: new () => FakeDatabase };
