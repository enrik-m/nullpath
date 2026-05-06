/**
 * Smoke test for the LIMITS table. The point isn't to verify specific
 * numbers — they're product decisions — but to lock down (a) every
 * known input field has a cap and (b) caps are sane (positive,
 * not unboundedly huge).
 */

import { describe, it, expect } from "vitest";
import { LIMITS } from "./limits";

describe("LIMITS", () => {
  it("covers every user-input field used by the UI", () => {
    const expected = [
      "handle",
      "resourceTitle",
      "resourceUrl",
      "resourceNote",
      "noteBody",
      "bountyProgram",
      "bountyTitle",
      "bountyCveId",
      "bountyRelatedNode",
      "bountyNotes",
    ];
    for (const k of expected) {
      expect(LIMITS).toHaveProperty(k);
      expect(typeof (LIMITS as Record<string, unknown>)[k]).toBe("number");
    }
  });

  it("every cap is positive", () => {
    for (const [k, v] of Object.entries(LIMITS)) {
      expect(v, `${k} should be > 0`).toBeGreaterThan(0);
    }
  });

  it("none of the caps are absurdly large (sanity)", () => {
    // 1 MB is more than any text input on this app should accept.
    for (const [k, v] of Object.entries(LIMITS)) {
      expect(v, `${k} should be < 1MB`).toBeLessThan(1_000_000);
    }
  });

  it("URL cap matches the common server limit", () => {
    expect(LIMITS.resourceUrl).toBeGreaterThanOrEqual(2000);
  });

  it("note body is the largest cap (it's freeform markdown)", () => {
    const others = Object.entries(LIMITS)
      .filter(([k]) => k !== "noteBody")
      .map(([, v]) => v);
    for (const v of others) {
      expect(LIMITS.noteBody).toBeGreaterThan(v);
    }
  });
});
