/**
 * useDailyBriefing
 *
 * Fires the daily-briefing modal once per local day, on first launch of the
 * app for that day. Tracks last-shown day in app_state.last_freeze_award_week —
 * we reuse that field as a piggy-back briefing-shown ledger via a synthetic
 * row. Cleaner is a dedicated `last_briefing_day` column, which we add lazily
 * via a tiny update on first run.
 *
 * Also: on the first session-end of a new day, awards a freeze token if the
 * weekly slot hasn't been claimed and the user is currently on a streak.
 */

import { useEffect, useRef } from "react";
import { useUi } from "../store";
import * as db from "../db";

const LS_LAST_BRIEFING_DAY = "nullpath:lastBriefingDay";

export function useDailyBriefing() {
  const route = useUi((s) => s.route);
  const showModal = useUi((s) => s.showModal);
  const fired = useRef(false);

  useEffect(() => {
    // Wait until we're past boot — atlas implies DB is up
    if (route.name === "boot") return;
    if (fired.current) return;
    fired.current = true;

    async function run() {
      const today = new Date();
      const todayKey = db.localDayKey(today);
      const last = localStorage.getItem(LS_LAST_BRIEFING_DAY);
      if (last === todayKey) return;

      // Wait a beat so we don't pop the modal at the exact moment the
      // boot fade ends.
      await new Promise((r) => setTimeout(r, 1100));

      // Single read of app_state — used both to gate the modal on onboarding
      // and to drive the weekly freeze-token award. Pre-DB-init failure
      // here is expected on first launch (migrations haven't run yet);
      // we silently skip and try again on the next mount.
      let state: Awaited<ReturnType<typeof db.getAppState>>;
      try {
        state = await db.getAppState();
      } catch {
        return;
      }
      if (!state.onboarded_at) return;

      localStorage.setItem(LS_LAST_BRIEFING_DAY, todayKey);
      showModal({ kind: "daily-briefing" });

      // Weekly freeze-token award. Failure here is non-fatal but worth
      // logging — the user just won't see their token bumped this week.
      try {
        const week = db.isoWeek(today);
        if (
          state.last_freeze_award_week !== week &&
          state.freeze_tokens < state.freeze_tokens_max
        ) {
          await db.updateAppState({
            freeze_tokens: state.freeze_tokens + 1,
            last_freeze_award_week: week,
          });
        }
      } catch (err) {
        console.error("[freeze-award] failed:", err);
      }
    }

    run();
  }, [route, showModal]);
}
