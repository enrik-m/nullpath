/**
 * URL safety helper tests. This is the security boundary that decides
 * whether to dispatch user-supplied URLs to the OS opener — getting
 * this wrong is XSS-equivalent.
 */

import { describe, it, expect } from "vitest";
import { isSafeUrl, parseSafeUrl, openSafeUrl } from "./url";

describe("isSafeUrl / parseSafeUrl", () => {
  it("accepts http and https", () => {
    expect(isSafeUrl("http://example.com")).toBe(true);
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("https://example.com/path?q=1#frag")).toBe(true);
  });

  it("rejects javascript: as the classic XSS vector", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("JavaScript:alert(1)")).toBe(false); // case-insensitive scheme
    expect(isSafeUrl("\tjavascript:alert(1)")).toBe(false); // leading whitespace
  });

  it("rejects file:// (would let the user browse local files)", () => {
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("file://C:/Windows/System32")).toBe(false);
  });

  it("rejects custom and exotic schemes", () => {
    expect(isSafeUrl("steam://run/123")).toBe(false);
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeUrl("mailto:foo@bar.com")).toBe(false);
    expect(isSafeUrl("ftp://example.com")).toBe(false);
  });

  it("rejects garbage / empty / null", () => {
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl("")).toBe(false);
    expect(isSafeUrl("   ")).toBe(false);
    expect(isSafeUrl("not a url")).toBe(false);
    expect(isSafeUrl("example.com")).toBe(false); // no scheme
  });

  it("trims whitespace before parsing", () => {
    expect(isSafeUrl("  https://example.com  ")).toBe(true);
  });

  it("parseSafeUrl returns the URL object on success, null on failure", () => {
    const u = parseSafeUrl("https://example.com/x?y=1");
    expect(u).not.toBeNull();
    expect(u?.host).toBe("example.com");
    expect(parseSafeUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("openSafeUrl", () => {
  it("throws on a disallowed scheme", async () => {
    await expect(openSafeUrl("javascript:alert(1)")).rejects.toThrow(/disallowed scheme/i);
  });

  it("does not throw on a safe URL (mocked opener no-ops)", async () => {
    await expect(openSafeUrl("https://example.com")).resolves.toBeUndefined();
  });
});
