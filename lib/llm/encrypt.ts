/**
 * App-level AES-256-GCM encryption for household AI keys.
 * Uses the Web Crypto API (available in Node 18+ / Edge runtime).
 * Key material: APP_ENCRYPTION_KEY env var (base64-encoded 32 bytes).
 */

function getKeyMaterial(): ArrayBuffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    getKeyMaterial(),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptKey(plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey();
  const ivBuffer = new ArrayBuffer(12);
  const ivView = new Uint8Array(ivBuffer);
  crypto.getRandomValues(ivView);
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBuffer }, key, encoded);
  return {
    ciphertext: Buffer.from(encrypted).toString("base64"),
    iv: Buffer.from(ivBuffer).toString("base64"),
  };
}

function bufToAb(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export async function decryptKey(ciphertext: string, iv: string): Promise<string> {
  const key = await importKey();
  const ivBytes = bufToAb(Buffer.from(iv, "base64"));
  const cipherBytes = bufToAb(Buffer.from(ciphertext, "base64"));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, cipherBytes);
  return new TextDecoder().decode(decrypted);
}
