/**
 * Downscale a picked image before it enters React state or an API request body.
 *
 * A modern phone camera produces a 3-8 MB JPEG. Read straight to a data URL, base64
 * inflates that by a further ~33% to 4-11 MB, and that string is then held in React
 * state, re-rendered as an <img src>, and JSON.stringify'd whole into the POST body of
 * /api/extract. Nothing downstream needs that resolution — the image is shown in a
 * ~200px preview and read by an LLM, which downsamples it anyway.
 *
 * Resizing to fit MAX_EDGE and re-encoding as WebP typically cuts this by 20-50x.
 */

/** Longest edge of the output, in CSS pixels. Comfortably above both the preview size
 *  and what a vision model resolves, while collapsing a 4000px camera image. */
const MAX_EDGE = 1024;
const QUALITY = 0.82;

export interface DownscaledImage {
  dataUrl: string;
  /** Bytes of the encoded result (approximate — derived from the base64 length). */
  bytes: number;
  width: number;
  height: number;
}

/** Approximate decoded byte length of a data URL's base64 payload. */
function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Returns a downscaled WebP data URL, or the original if anything makes that
 * impossible (no canvas, an image the browser can't decode, an encoder that returns
 * nothing). Never throws for a readable file: a slightly slow upload beats a scan flow
 * that refuses to start.
 */
export async function downscaleImage(file: File): Promise<DownscaledImage> {
  const original = await readAsDataUrl(file);
  const fallback = (): DownscaledImage => ({ dataUrl: original, bytes: dataUrlBytes(original), width: 0, height: 0 });

  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return fallback();

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return fallback(); // unsupported/corrupt encoding — let the server decide
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Already small enough: re-encoding would only lose quality for no gain.
    if (scale === 1 && file.type === "image/webp") return fallback();

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback();
    ctx.drawImage(bitmap, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/webp", QUALITY);
    // Some browsers ignore an unsupported type and silently hand back PNG, which can
    // be larger than the original. Only take the result if it's actually smaller.
    if (!dataUrl.startsWith("data:image/")) return fallback();
    const bytes = dataUrlBytes(dataUrl);
    if (bytes >= dataUrlBytes(original)) return fallback();

    return { dataUrl, bytes, width, height };
  } finally {
    bitmap.close();
  }
}
