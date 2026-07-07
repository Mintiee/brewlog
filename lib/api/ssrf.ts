/**
 * SSRF guard for /api/extract's user-supplied product URL fetch.
 * Rejects non-https URLs, and any hostname/redirect target that is (or
 * resolves to) a loopback, private, link-local, or cloud-metadata address.
 */
import dns from "node:dns/promises";
import { isIP } from "node:net";

/** Thrown for a URL rejected by the SSRF guard — routes should map this to a 400. */
export class UnsafeUrlError extends Error {}

/** IPv4 ranges to block: "this network", RFC1918 private, loopback, link-local/metadata. */
const PRIVATE_V4_CIDRS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n == null) return true; // unparsable — fail closed
  for (const [base, bits] of PRIVATE_V4_CIDRS) {
    const baseN = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((n & mask) === (baseN & mask)) return true;
  }
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) — check the embedded v4 address.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 link-local
  return false;
}

/** Is this IP literal (v4 or v6) in a private/loopback/link-local/metadata range? */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // not a valid IP literal — fail closed
}

export interface UrlCheck {
  ok: boolean;
  error?: string;
}

/**
 * Validate a single URL hop: must be https, well-formed, and not a literal
 * private address or a hostname that resolves to one. Call this again for
 * every redirect target — a first hop can be public while the redirect
 * points inward.
 */
export async function validateExtractUrl(input: string): Promise<UrlCheck> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Only https URLs are allowed" };
  }

  const hostname = parsed.hostname;
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) return { ok: false, error: "URL resolves to a private address" };
    return { ok: true };
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    return { ok: false, error: "Could not resolve host" };
  }
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    return { ok: false, error: "URL resolves to a private address" };
  }
  return { ok: true };
}

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 1024 * 1024; // 1MB

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("Response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

/**
 * Fetch a user-supplied URL defensively for /api/extract: validates the URL
 * (and every redirect target, up to MAX_REDIRECTS hops) against
 * validateExtractUrl, follows redirects manually so each hop is checked
 * before it's requested, and caps the response body at ~1MB.
 * Throws UnsafeUrlError for anything the SSRF guard rejects; other fetch
 * failures (timeouts, non-2xx, oversized body) throw a plain Error.
 */
export async function safeFetchText(
  initialUrl: string,
  opts?: { headers?: Record<string, string>; timeoutMs?: number }
): Promise<string> {
  let currentUrl = initialUrl;
  let redirects = 0;

  for (;;) {
    const check = await validateExtractUrl(currentUrl);
    if (!check.ok) throw new UnsafeUrlError(check.error ?? "URL rejected");

    const res = await fetch(currentUrl, {
      headers: opts?.headers,
      redirect: "manual",
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 8000),
    });

    if (res.status >= 300 && res.status < 400) {
      if (redirects >= MAX_REDIRECTS) throw new UnsafeUrlError("Too many redirects");
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect with no Location header");
      currentUrl = new URL(location, currentUrl).toString();
      redirects++;
      continue;
    }

    if (!res.ok) throw new Error(`Page fetch failed: ${res.status}`);
    return readCapped(res, MAX_RESPONSE_BYTES);
  }
}
