/**
 * Vitest mock for @tauri-apps/plugin-sql.
 *
 * Real Database.load() opens a SQLite file via the Tauri shell, which
 * isn't available under Vitest. Returns an inert handle so modules that
 * eagerly import the plugin can load — actual query helpers are tested
 * by mocking at the call site, not here.
 */

const Database = {
  async load(_url: string) {
    return {
      async select<T>(_q: string, _args?: unknown[]): Promise<T> {
        return [] as unknown as T;
      },
      async execute(_q: string, _args?: unknown[]) {
        return { lastInsertId: 0, rowsAffected: 0 };
      },
    };
  },
};

export default Database;
