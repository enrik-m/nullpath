/**
 * Smoke test: dual-route module loads correctly in local mode.
 *
 * The full cloud path is exercised against a live Supabase project in
 * a separate integration suite — running it from CI would require
 * provisioning per-CI-run accounts, which isn't justified for a beta.
 * This test just verifies the routing layer doesn't blow up at module
 * load and that `isCloudMode()` defaults to false when env vars are
 * missing (the safe default for self-hosters).
 */

import { describe, expect, it } from "vitest";
import { isCloudMode } from "../lib/supabase";
import * as db from "./index";

describe("db router", () => {
  it("defaults to local mode without env vars", () => {
    // The vitest harness doesn't inject Vite env vars, so this is the
    // self-hoster path. Cloud mode requires both URL + key.
    expect(isCloudMode()).toBe(false);
  });

  it("exposes the full public surface", () => {
    // Sanity: all the helpers the views import resolve to functions.
    expect(typeof db.getRegions).toBe("function");
    expect(typeof db.getZoneStats).toBe("function");
    expect(typeof db.setNodeStatus).toBe("function");
    expect(typeof db.recordCompletionDay).toBe("function");
    expect(typeof db.currentStreak).toBe("function");
    expect(typeof db.evaluateAchievementsCloud).toBe("function");
    expect(typeof db.isFirstSyncNeeded).toBe("function");
  });

  it("cloud-only helpers are no-ops in local mode", async () => {
    // Local mode shims return safe defaults so consumers can call them
    // unconditionally without branching.
    await expect(db.isFirstSyncNeeded()).resolves.toBe(false);
    await expect(db.evaluateAchievementsCloud()).resolves.toEqual([]);
  });
});
