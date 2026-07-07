import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// Mock the DB executor so drain runs against controllable stubs, not Supabase.
vi.mock("@/lib/db/writeExecutors", () => ({ executeWrite: vi.fn() }));
import { executeWrite } from "@/lib/db/writeExecutors";
import {
  setOutboxStorage,
  enqueueWrite,
  drainOutbox,
  outboxSize,
  type OutboxEntry,
  type OutboxStorage,
} from "@/lib/store/outbox";

const mockExec = executeWrite as unknown as ReturnType<typeof vi.fn>;

/** In-memory storage shim (dependency-injected via setOutboxStorage). */
function memStorage(): OutboxStorage & { entries: Map<string, OutboxEntry> } {
  const entries = new Map<string, OutboxEntry>();
  return {
    entries,
    add: async (e) => { entries.set(e.id, e); },
    getAll: async () => [...entries.values()],
    remove: async (id) => { entries.delete(id); },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const brew = (id: string): any => ({ kind: "insertBrew", payload: { id } });
const entry = (id: string, at: number): OutboxEntry => ({
  id, label: `Brew ${id}`, descriptor: brew(id), enqueuedAt: at,
});

let store: ReturnType<typeof memStorage>;

beforeEach(() => {
  store = memStorage();
  setOutboxStorage(store);
  mockExec.mockReset();
});
afterEach(() => setOutboxStorage(null));

describe("outbox", () => {
  it("enqueueWrite persists and outboxSize reflects the queue", async () => {
    expect(await outboxSize()).toBe(0);
    expect(await enqueueWrite(brew("b1"), "Brew save")).toBe(true);
    expect(await outboxSize()).toBe(1);
  });

  it("returns false from enqueueWrite when there is no backend", async () => {
    setOutboxStorage(null); // no override; jsdom has no indexedDB
    expect(await enqueueWrite(brew("b1"), "Brew save")).toBe(false);
  });

  it("drains all entries in FIFO (enqueuedAt) order and clears the queue", async () => {
    // Insert out of enqueue order to prove the sort.
    await store.add(entry("c", 3));
    await store.add(entry("a", 1));
    await store.add(entry("b", 2));
    mockExec.mockResolvedValue(undefined);

    const res = await drainOutbox();
    expect(res).toEqual({ drained: 3, remaining: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = mockExec.mock.calls.map((c) => (c[0] as any).payload.id);
    expect(order).toEqual(["a", "b", "c"]);
    expect(store.entries.size).toBe(0);
  });

  it("stops on a transient error, preserving that entry and later ones", async () => {
    await store.add(entry("a", 1));
    await store.add(entry("b", 2));
    await store.add(entry("c", 3));
    mockExec
      .mockResolvedValueOnce(undefined)                  // a succeeds
      .mockRejectedValueOnce(new Error("network blip")); // b transient → stop

    const res = await drainOutbox();
    expect(res).toEqual({ drained: 1, remaining: 2 });
    expect(mockExec).toHaveBeenCalledTimes(2);   // a, b — c never attempted
    expect(store.entries.has("a")).toBe(false);
    expect(store.entries.has("b")).toBe(true);   // preserved for retry
    expect(store.entries.has("c")).toBe(true);   // ordering preserved
  });

  it("drops a permanent-error entry and continues, surfacing it", async () => {
    await store.add(entry("a", 1));
    await store.add(entry("b", 2));
    mockExec
      .mockRejectedValueOnce({ code: "23505" }) // a permanent → drop + surface
      .mockResolvedValueOnce(undefined);        // b succeeds
    const onPermanentError = vi.fn();

    const res = await drainOutbox({ onPermanentError });
    expect(res).toEqual({ drained: 2, remaining: 0 });
    expect(onPermanentError).toHaveBeenCalledTimes(1);
    expect(onPermanentError.mock.calls[0][0].id).toBe("a");
    expect(store.entries.size).toBe(0);
  });

  it("is a no-op while offline, reporting the remaining size", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await store.add(entry("a", 1));
    const res = await drainOutbox();
    expect(res).toEqual({ drained: 0, remaining: 1 });
    expect(mockExec).not.toHaveBeenCalled();
    onLine.mockRestore();
  });
});
