import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INTENT_CACHE, INTENT_KEY, INTENT_MAX_AGE_MS,
  claimNudgeIntent, resetNudgeIntentClaims, takeNudgeIntent,
} from "./intent";

// A minimal Cache Storage: named caches holding string bodies. It covers only the
// calls intent.ts makes. jsdom has no `caches` at all.
function fakeCaches() {
  const stores = new Map<string, Map<string, string>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (key: string) => (m.has(key) ? new Response(m.get(key)) : undefined),
      delete: async (key: string) => m.delete(key),
      put: async (key: string, body: string) => { m.set(key, body); },
    };
  };
  return { stores, api: { open } };
}

const NOW = 1_800_000_000_000;
const intent = (over: Partial<{ id: string; url: string; at: number }> = {}) =>
  ({ id: "tap-1", url: "/?rate=b1", at: NOW - 1000, ...over });

let fc: ReturnType<typeof fakeCaches>;
async function stash(value: unknown) {
  const c = await fc.api.open(INTENT_CACHE);
  await c.put(INTENT_KEY, JSON.stringify(value));
}
const mailboxHas = () => fc.stores.get(INTENT_CACHE)?.has(INTENT_KEY) ?? false;

beforeEach(() => {
  resetNudgeIntentClaims();
  fc = fakeCaches();
  vi.stubGlobal("caches", fc.api);
});
afterEach(() => vi.unstubAllGlobals());

describe("claimNudgeIntent", () => {
  it("accepts a fresh intent once, then rejects the same id", () => {
    expect(claimNudgeIntent(intent(), NOW)).toEqual(intent());
    expect(claimNudgeIntent(intent(), NOW)).toBeNull();
  });

  it("accepts a different id after one has been claimed", () => {
    claimNudgeIntent(intent(), NOW);
    expect(claimNudgeIntent(intent({ id: "tap-2" }), NOW)?.id).toBe("tap-2");
  });

  it("rejects stale and far-future taps", () => {
    expect(claimNudgeIntent(intent({ at: NOW - INTENT_MAX_AGE_MS - 1 }), NOW)).toBeNull();
    expect(claimNudgeIntent(intent({ at: NOW + INTENT_MAX_AGE_MS + 1 }), NOW)).toBeNull();
  });

  it("rejects malformed payloads", () => {
    for (const bad of [null, undefined, "x", 42, {}, { id: 1, url: "/", at: NOW }, { id: "a", url: "/" }]) {
      expect(claimNudgeIntent(bad, NOW)).toBeNull();
    }
  });
});

describe("takeNudgeIntent", () => {
  it("returns null for an empty mailbox", async () => {
    expect(await takeNudgeIntent(NOW)).toBeNull();
  });

  it("returns a fresh intent and clears the mailbox", async () => {
    await stash(intent());
    expect(await takeNudgeIntent(NOW)).toEqual(intent());
    expect(mailboxHas()).toBe(false);
    expect(await takeNudgeIntent(NOW)).toBeNull();
  });

  it("clears a stale entry without returning it", async () => {
    await stash(intent({ at: NOW - INTENT_MAX_AGE_MS - 1 }));
    expect(await takeNudgeIntent(NOW)).toBeNull();
    expect(mailboxHas()).toBe(false);
  });

  it("does not replay a tap already delivered by postMessage", async () => {
    // The warm path: the message is claimed first, then the pull finds the
    // mailbox copy of the same tap.
    expect(claimNudgeIntent(intent(), NOW)).not.toBeNull();
    await stash(intent());
    expect(await takeNudgeIntent(NOW)).toBeNull();
    expect(mailboxHas()).toBe(false);
  });

  it("yields one result when concurrent pulls race on the same entry", async () => {
    // A focus + visibilitychange pair both pull before either has deleted.
    await stash(intent());
    const results = await Promise.all([takeNudgeIntent(NOW), takeNudgeIntent(NOW), takeNudgeIntent(NOW)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("survives a corrupt entry", async () => {
    const c = await fc.api.open(INTENT_CACHE);
    await c.put(INTENT_KEY, "{not json");
    expect(await takeNudgeIntent(NOW)).toBeNull();
    expect(mailboxHas()).toBe(false);
  });

  it("is a no-op where Cache Storage doesn't exist", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("caches", undefined);
    expect(await takeNudgeIntent(NOW)).toBeNull();
  });
});
