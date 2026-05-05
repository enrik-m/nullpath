/**
 * useSessionTicker
 * -----------------------------------------------------------------------------
 * Once a session is active, this hook drives:
 *  - 1-second tick increments to the in-memory duration counter
 *  - 5-second polling of OS idle time via the `get_idle_seconds` Tauri command
 *  - Auto-pause when idle threshold is crossed (raises an "idle-resume" modal)
 *  - Auto-end when idle hard-cap is crossed
 *  - Periodic flush of duration to SQLite so a crash doesn't lose a session
 */

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUi } from "../store";
import * as db from "../db";
import { sfx } from "../lib/sfx";

const TICK_MS = 1000;
const IDLE_POLL_MS = 5000;
const FLUSH_EVERY = 30; // seconds

let supportedCache: boolean | null = null;

async function getOsIdleSeconds(): Promise<number | null> {
  if (supportedCache === null) {
    try {
      supportedCache = await invoke<boolean>("idle_supported_on_platform");
    } catch {
      supportedCache = false;
    }
  }
  if (!supportedCache) return null;
  try {
    return await invoke<number>("get_idle_seconds");
  } catch {
    return null;
  }
}

export function useSessionTicker() {
  const session = useUi((s) => s.activeSession);
  const patchSession = useUi((s) => s.patchSession);
  const setSession = useUi((s) => s.setSession);
  const showModal = useUi((s) => s.showModal);

  // Refs because intervals close over stale state
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const flushCounter = useRef(0);
  const lastIdleSeconds = useRef(0);

  useEffect(() => {
    if (!session) return;

    const tickInterval = window.setInterval(() => {
      const cur = sessionRef.current;
      if (!cur || cur.paused) return;
      const newDuration = cur.durationSeconds + 1;
      patchSession({ durationSeconds: newDuration });
      flushCounter.current++;
      if (flushCounter.current >= FLUSH_EVERY) {
        flushCounter.current = 0;
        db.updateSession(cur.id, {
          duration_seconds: newDuration,
          idle_seconds: cur.idleSeconds,
        }).catch(() => {});
      }
    }, TICK_MS);

    let idleInterval: number | null = null;

    async function pollIdle() {
      const cur = sessionRef.current;
      if (!cur || cur.paused) return;

      const settings = await db.getAppState().catch(() => null);
      if (!settings) return;
      const threshold = settings.idle_threshold_seconds;
      const hardCap = settings.idle_hard_cap_seconds;

      const idleSecs = await getOsIdleSeconds();
      if (idleSecs == null) return;

      // Hard cap → auto end
      if (idleSecs >= hardCap) {
        sfx.warn();
        await db.endSession(cur.id, cur.durationSeconds, cur.idleSeconds + idleSecs, true);
        await db.recordStudyDay(cur.durationSeconds);
        setSession(null);
        showModal({
          kind: "session-end",
          durationSeconds: cur.durationSeconds,
          xpEarned: Math.floor(cur.durationSeconds / 60) * 4,
          nodeId: cur.focusNodeId,
        });
        return;
      }

      // Threshold → pause + raise modal (only first crossing)
      if (idleSecs >= threshold && lastIdleSeconds.current < threshold) {
        sfx.warn();
        patchSession({ paused: true, pausedAtMs: Date.now() });
        showModal({ kind: "idle-resume", idleSeconds: idleSecs });
      }
      lastIdleSeconds.current = idleSecs;
    }

    idleInterval = window.setInterval(pollIdle, IDLE_POLL_MS);

    return () => {
      window.clearInterval(tickInterval);
      if (idleInterval !== null) window.clearInterval(idleInterval);
    };
    // Only re-run when the session id changes (start/stop/replace).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);
}
