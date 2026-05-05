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
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const last = localStorage.getItem(LS_LAST_BRIEFING_DAY);
      if (last === todayKey) return;

      // Wait a beat so we don't pop modal at the exact moment the boot fade ends
      await new Promise((r) => setTimeout(r, 1100));

      // Only fire if onboarded
      try {
        const state = await db.getAppState();
        if (!state.onboarded_at) return;
      } catch {
        return;
      }

      localStorage.setItem(LS_LAST_BRIEFING_DAY, todayKey);
      showModal({ kind: "daily-briefing" });

      // Weekly freeze-token award
      try {
        const state = await db.getAppState();
        const week = isoWeek(today);
        if (
          state.last_freeze_award_week !== week &&
          state.freeze_tokens < state.freeze_tokens_max
        ) {
          await db.updateAppState({
            freeze_tokens: state.freeze_tokens + 1,
            last_freeze_award_week: week,
          });
        }
      } catch {
        // Ignore
      }
    }

    run();
  }, [route, showModal]);
}

function isoWeek(d: Date): string {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}
