import { describe, it, expect, afterEach, vi } from "vitest";
import { downscaleImage } from "./downscale";

/**
 * The canvas path can't run under vitest, so these cover the contract that matters for
 * correctness rather than the resize maths: whatever the environment does or doesn't
 * support, a readable file must still come back as a usable data URL. A scan flow that
 * refuses to start is far worse than one that uploads a large image.
 */

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
]);

function fakeFile(type = "image/png"): File {
  return new File([PNG_BYTES], "bag.png", { type });
}

const originalCreateImageBitmap = (globalThis as Record<string, unknown>).createImageBitmap;

afterEach(() => {
  if (originalCreateImageBitmap === undefined) delete (globalThis as Record<string, unknown>).createImageBitmap;
  else (globalThis as Record<string, unknown>).createImageBitmap = originalCreateImageBitmap;
  vi.restoreAllMocks();
});

describe("downscaleImage", () => {
  it("falls back to the original when createImageBitmap is unavailable", async () => {
    delete (globalThis as Record<string, unknown>).createImageBitmap;
    const out = await downscaleImage(fakeFile());
    expect(out.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(out.bytes).toBe(PNG_BYTES.length);
  });

  it("falls back when the browser cannot decode the image", async () => {
    // A corrupt or exotic encoding must not sink the flow — the server can still try.
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn().mockRejectedValue(new Error("decode failed"));
    const out = await downscaleImage(fakeFile());
    expect(out.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("reports the decoded byte length, not the base64 length", async () => {
    // The caller uses this to reason about upload size; base64 overstates it by ~33%.
    delete (globalThis as Record<string, unknown>).createImageBitmap;
    const out = await downscaleImage(fakeFile());
    expect(out.bytes).toBe(16);
    expect(out.dataUrl.length).toBeGreaterThan(out.bytes);
  });

  it("rejects only when the file itself cannot be read", async () => {
    delete (globalThis as Record<string, unknown>).createImageBitmap;
    const unreadable = {
      type: "image/png",
      // FileReader will throw on a non-Blob.
    } as unknown as File;
    await expect(downscaleImage(unreadable)).rejects.toBeTruthy();
  });
});
