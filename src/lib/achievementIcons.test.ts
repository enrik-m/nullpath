/**
 * Tests for the icon resolver. The original "Stars vs Star" typo
 * survived two passes of human review — pinning every catalog icon
 * resolves to a non-fallback Lucide component is exactly the kind of
 * test that catches the next typo before it ships.
 */

import { describe, it, expect } from "vitest";
import { Trophy } from "lucide-react";
import { resolveAchievementIcon } from "./achievementIcons";
import { getAchievementCatalog } from "./achievements";

describe("resolveAchievementIcon", () => {
  it("returns the Trophy fallback on null / undefined / empty", () => {
    expect(resolveAchievementIcon(null)).toBe(Trophy);
    expect(resolveAchievementIcon(undefined)).toBe(Trophy);
    expect(resolveAchievementIcon("")).toBe(Trophy);
  });

  it("returns the Trophy fallback on unknown names", () => {
    // A name shaped like an icon but not in the explicit map. This is
    // exactly the regression we want to catch — silent fallback rather
    // than crash, but the gallery's then rendering Trophy everywhere.
    expect(resolveAchievementIcon("DoesNotExistIcon")).toBe(Trophy);
  });

  it("resolves Trophy itself (sanity check the map is loaded)", () => {
    expect(resolveAchievementIcon("Trophy")).toBe(Trophy);
  });

  it("every catalog entry's icon resolves to a non-Trophy component (or to Trophy intentionally)", () => {
    // Walk the whole catalog — for each entry, the resolver should
    // either return a real Lucide component matching the name, or
    // return Trophy if the icon name happens to BE 'Trophy'. Any
    // OTHER name returning Trophy means we've fallen through to the
    // fallback, which is the exact bug this test exists to catch.
    for (const spec of getAchievementCatalog()) {
      const resolved = resolveAchievementIcon(spec.icon);
      if (spec.icon !== "Trophy") {
        expect(
          resolved,
          `${spec.id}: icon "${spec.icon}" fell back to Trophy — typo or missing import?`,
        ).not.toBe(Trophy);
      }
    }
  });

  it("is case-sensitive (lucide names are PascalCase)", () => {
    // 'trophy' lowercase shouldn't resolve — catches a future caller
    // that accidentally lowercases the name.
    expect(resolveAchievementIcon("trophy")).toBe(Trophy); // fallback
    expect(resolveAchievementIcon("TROPHY")).toBe(Trophy); // fallback
  });
});
