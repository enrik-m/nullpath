/**
 * Cloud-mode realtime subscriptions.
 *
 * Subscribes to the `user_achievement` table and queues an unlock
 * modal whenever a new row appears for the current user. RLS gates
 * the subscription to the user's own rows automatically — Supabase
 * Realtime respects per-user policies the same way regular SELECTs do.
 *
 * The same modal queue is used by the local engine's
 * `evaluateAchievements()` so a row that lands via both paths (server
 * eval triggered by the current tab + realtime echo of the same insert)
 * only pops one modal. Dedup happens in `queueAchievementModal()`.
 *
 * No-op in local mode — module is still safe to import.
 */

import { currentUser, getSupabaseClient, isCloudMode, onAuthChange } from "./supabase";
import { queueAchievementModal } from "./achievements";

let activeUnsubscribe: (() => void) | null = null;
/**
 * The user id the active subscription is bound to. Tracked so non-id
 * auth events (TOKEN_REFRESHED, USER_UPDATED with the same id, repeated
 * SIGNED_IN deliveries) don't churn the channel — Supabase emits
 * onAuthStateChange more often than the identity actually changes, and
 * tearing down + resubscribing on every emission would briefly drop
 * realtime unlock notifications during normal token refresh cycles.
 */
let activeUserId: string | null = null;

/**
 * Start the realtime subscription. Tied to the current auth state:
 * re-subscribes only when the user identity actually changes, tears
 * down when they sign out.
 */
export function startRealtimeWatcher(): () => void {
  if (!isCloudMode()) {
    return () => {};
  }

  const off = onAuthChange((user) => {
    const newUserId = user?.id ?? null;
    // No-op when the identity hasn't changed (token refresh, metadata
    // update, immediate-replay-on-subscribe, etc.). Only sign-in,
    // sign-out, or account switch reach the teardown branch below.
    if (newUserId === activeUserId) return;
    activeUnsubscribe?.();
    activeUnsubscribe = null;
    activeUserId = newUserId;
    if (!newUserId) return;
    activeUnsubscribe = subscribeForUser(newUserId);
  });

  // Seed: the cached user might already be available when we mount.
  const cached = currentUser();
  if (cached && activeUserId !== cached.id) {
    activeUserId = cached.id;
    activeUnsubscribe = subscribeForUser(cached.id);
  }

  return () => {
    activeUnsubscribe?.();
    activeUnsubscribe = null;
    activeUserId = null;
    off();
  };
}

function subscribeForUser(userId: string): () => void {
  const client = getSupabaseClient();
  const channel = client
    .channel(`user_achievement:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "user_achievement",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown> | null;
        if (!row) return;
        queueAchievementModal({
          id: String(row.achievement_id ?? ""),
          name: String(row.name ?? ""),
          description: String(row.description ?? ""),
          icon: String(row.icon ?? "Trophy"),
        });
      },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[realtime] user_achievement subscription:", status);
      }
    });

  return () => {
    void client.removeChannel(channel);
  };
}
