import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyUnknownNotes } from "./classify";
import { noteIcon } from "./index";

// classify.ts keeps a module-level `requested` set, and index.ts a module-level
// learned cache — both persist across tests in this file, so every test uses
// its own fresh note strings.

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => fetchMock.mockReset());

describe("classifyUnknownNotes", () => {
  it("POSTs only lexicon-missed notes and learns the result", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { map: { feijoa: "yellowfruit" } }));

    const map = await classifyUnknownNotes(["lemon", "Feijoa"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.notes).toEqual(["feijoa"]); // "lemon" is lexicon-known, never sent
    expect(map).toEqual({ feijoa: "yellowfruit" });
    expect(noteIcon("feijoa")).toBe("yellowfruit"); // pushed into the learned cache
  });

  it("never re-requests a note already sent this session", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { map: {} }));
    await classifyUnknownNotes(["rambutan"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await classifyUnknownNotes(["rambutan"]);
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // no second fetch
  });

  it("returns null silently on 403 (no AI key) and does not retry", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "No AI key configured" }));
    expect(await classifyUnknownNotes(["durian"])).toBeNull();

    const again = await classifyUnknownNotes(["durian"]);
    expect(again).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null on network error but allows a later retry", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await classifyUnknownNotes(["salak"])).toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { map: { salak: "yellowfruit" } }));
    expect(await classifyUnknownNotes(["salak"])).toEqual({ salak: "yellowfruit" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when every note is already known", async () => {
    expect(await classifyUnknownNotes(["lemon", "chocolate"])).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
