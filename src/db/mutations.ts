/**
 * Shared mutation pub/sub for both DB backends.
 *
 * Every write on either the local sql.js path or the cloud Supabase
 * path calls `notifyMutation()` so derived listeners (achievement
 * engine, sidebar refetch hooks) can refresh. Lives in its own module
 * so both `db/local.ts` and `db/cloud.ts` can import it without
 * circular references.
 */

type MutationListener = () => void;

const listeners = new Set<MutationListener>();

export function onMutation(fn: MutationListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyMutation(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // A listener throwing must not block other listeners.
    }
  }
}
