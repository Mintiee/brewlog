import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { persist, writesInFlight, writesIdle } from "@/lib/store/persist";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** Run persist with fake timers, flushing retry sleeps until it settles. */
async function settle(p: Promise<boolean>): Promise<boolean> {
  let done = false;
  let result = false;
  void p.then((r) => { done = true; result = r; });
  // Generous upper bound: flush microtasks + pending timers until resolved.
  for (let i = 0; i < 50 && !done; i++) {
    await vi.advanceTimersByTimeAsync(1000);
  }
  expect(done).toBe(true);
  return result;
}

describe("persist", () => {
  it("returns true on first-attempt success without calling onError", async () => {
    const onError = vi.fn();
    const ok = await persist("Save", async () => {}, { onError });
    expect(ok).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("retries transient failures and succeeds", async () => {
    const onError = vi.fn();
    const rollback = vi.fn();
    let calls = 0;
    const write = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error("network blip");
    });
    const ok = await settle(persist("Save", write, { onError, rollback }));
    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(3);
    expect(onError).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });

  it("rolls back and surfaces the error once after exhausting retries", async () => {
    const onError = vi.fn();
    const rollback = vi.fn();
    const write = vi.fn(async () => { throw new Error("down"); });
    const ok = await settle(persist("Rating save", write, { onError, rollback }));
    expect(ok).toBe(false);
    expect(write).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toContain("Rating save failed");
    expect(typeof onError.mock.calls[0][1]).toBe("function");
  });

  it("does not retry permanent errors (constraint / RLS class)", async () => {
    const onError = vi.fn();
    const write = vi.fn(async () => { throw { code: "23505", message: "duplicate key" }; });
    const ok = await settle(persist("Save", write, { onError }));
    expect(ok).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("the onError retry function re-runs the write", async () => {
    const onError = vi.fn();
    let fail = true;
    const write = vi.fn(async () => { if (fail) throw { code: "23505" }; });
    await settle(persist("Save", write, { onError }));
    expect(write).toHaveBeenCalledTimes(1);
    fail = false;
    const retry = onError.mock.calls[0][1] as () => void;
    retry();
    await settle(Promise.resolve(true));
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("tracks in-flight writes and resolves writesIdle only at zero", async () => {
    expect(writesInFlight()).toBe(0);
    let release1!: () => void; let release2!: () => void;
    const p1 = persist("A", () => new Promise<void>((r) => { release1 = r; }), { onError: () => {} });
    const p2 = persist("B", () => new Promise<void>((r) => { release2 = r; }), { onError: () => {} });
    expect(writesInFlight()).toBe(2);
    let idle = false;
    void writesIdle().then(() => { idle = true; });
    release1();
    await p1;
    expect(idle).toBe(false);
    expect(writesInFlight()).toBe(1);
    release2();
    await p2;
    await Promise.resolve();
    expect(idle).toBe(true);
    expect(writesInFlight()).toBe(0);
  });

  it("writesIdle resolves immediately when idle", async () => {
    let idle = false;
    void writesIdle().then(() => { idle = true; });
    await Promise.resolve();
    expect(idle).toBe(true);
  });

  it("waits for the online event before retrying while offline", async () => {
    const onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const onError = vi.fn();
    let calls = 0;
    const write = vi.fn(async () => { calls++; if (calls === 1) throw new Error("offline"); });
    const p = persist("Save", write, { onError });
    await vi.advanceTimersByTimeAsync(5000);
    expect(write).toHaveBeenCalledTimes(1); // still waiting for online
    onLineSpy.mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    const ok = await settle(p);
    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    onLineSpy.mockRestore();
  });
});
