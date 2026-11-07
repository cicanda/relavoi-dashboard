import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useNow } from "@/lib/use-now";

/**
 * The clock the session detail screen reads instead of calling Date.now() in
 * its render body. What matters is that it moves, that every reader sees the
 * same value, and that reading it twice in one render gives one answer.
 */
describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the current time and advances with the clock", () => {
    const { result } = renderHook(() => useNow());
    const first = result.current;
    expect(first).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current).toBeGreaterThanOrEqual(first + 3_000);
  });

  it("gives every reader the same value, from one timer", () => {
    const a = renderHook(() => useNow());
    const b = renderHook(() => useNow());
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(a.result.current).toBe(b.result.current);
  });

  it("stops ticking once the last reader unmounts", () => {
    const spy = vi.spyOn(global, "clearInterval");
    const a = renderHook(() => useNow());
    const b = renderHook(() => useNow());
    a.unmount();
    expect(spy).not.toHaveBeenCalled();
    b.unmount();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
