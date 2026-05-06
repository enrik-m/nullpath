/**
 * Tests for the toast store. Covers push/dismiss + auto-dismiss
 * timing using vitest fake timers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { toast, useToasts } from "./toast";

describe("toast store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear any leftover state between tests
    useToasts.setState({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("push adds a toast with a unique id and the right shape", () => {
    toast.info("hello");
    const items = useToasts.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("info");
    expect(items[0]?.message).toBe("hello");
    expect(items[0]?.id).toBeGreaterThan(0);
  });

  it("each push gets a different id", () => {
    toast.info("a");
    toast.info("b");
    const items = useToasts.getState().items;
    expect(items[0]?.id).not.toBe(items[1]?.id);
  });

  it("dismiss removes the toast immediately", () => {
    toast.info("dismissable");
    const id = useToasts.getState().items[0]?.id ?? 0;
    useToasts.getState().dismiss(id);
    expect(useToasts.getState().items).toHaveLength(0);
  });

  it("auto-dismisses info toasts after 4s", () => {
    toast.info("ephemeral");
    expect(useToasts.getState().items).toHaveLength(1);
    vi.advanceTimersByTime(3999);
    expect(useToasts.getState().items).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(useToasts.getState().items).toHaveLength(0);
  });

  it("error toasts stay around longer (6s)", () => {
    toast.error("important");
    vi.advanceTimersByTime(4001);
    expect(useToasts.getState().items).toHaveLength(1); // still here at 4s
    vi.advanceTimersByTime(2000);
    expect(useToasts.getState().items).toHaveLength(0);
  });

  it("multiple kinds coexist", () => {
    toast.info("i");
    toast.success("s");
    toast.warn("w");
    toast.error("e");
    const items = useToasts.getState().items;
    expect(items.map((t) => t.kind)).toEqual(["info", "success", "warn", "error"]);
  });

  it("dismissing one does not affect others", () => {
    toast.info("keep");
    toast.error("kill");
    const target = useToasts.getState().items.find((t) => t.message === "kill");
    expect(target).toBeDefined();
    useToasts.getState().dismiss(target!.id);
    const remaining = useToasts.getState().items;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.message).toBe("keep");
  });
});
