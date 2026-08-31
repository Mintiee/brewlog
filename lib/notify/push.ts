/**
 * Web Push delivery. Thin wrapper over `web-push` so the cron route deals in
 * outcomes ("gone", "retry", "sent") rather than in HTTP status codes.
 *
 * Node runtime only — web-push needs Node crypto for the VAPID signature.
 */
import webpush, { WebPushError } from "web-push";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Relative URL the notification opens, e.g. "/?rate=<brewId>". */
  url: string;
  /** Collapse key — a newer notification with the same tag replaces the old one. */
  tag: string;
}

/** What the caller should do about this endpoint. */
export type PushOutcome =
  | { status: "sent" }
  /** The subscription is dead — delete the row. */
  | { status: "gone" }
  /** Transient (429/5xx) — release the claim so the next tick retries. */
  | { status: "retry"; code: number }
  /** Our own bug (400/413) — keep the claim so we don't spam every 5 minutes. */
  | { status: "failed"; code: number; message: string };

let configured = false;

/** Returns false when VAPID isn't configured — the route then no-ops instead of
 *  throwing on every tick. */
export function pushConfigured(): boolean {
  const { NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!NEXT_PUBLIC_VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false;
  if (!configured) {
    webpush.setVapidDetails(VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

/**
 * Send to one endpoint. Never throws — every failure comes back as an outcome,
 * because a single dead phone must not take down the run for everyone else.
 */
export async function sendOne(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
  if (!pushConfigured()) return { status: "failed", code: 0, message: "VAPID not configured" };

  const body = JSON.stringify(payload);
  // The push service caps the encrypted payload at ~4 KB. Ours is three short
  // strings, so blowing this is a bug worth catching here rather than as a 413.
  if (Buffer.byteLength(body) > 3072) {
    return { status: "failed", code: 413, message: "payload too large" };
  }

  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      body,
      { TTL: 60 * 30 }, // a nudge that hasn't been delivered in 30 min is stale
    );
    return { status: "sent" };
  } catch (e) {
    if (e instanceof WebPushError) {
      const code = e.statusCode;
      if (code === 404 || code === 410) return { status: "gone" };
      if (code === 429 || code >= 500) return { status: "retry", code };
      return { status: "failed", code, message: e.body || e.message };
    }
    // Network-level failure: treat as transient.
    return { status: "retry", code: 0 };
  }
}

export interface FanOutResult {
  sent: number;
  /** Endpoints to delete. */
  gone: string[];
  /** True if any endpoint asked us to back off — the caller releases the claim. */
  retry: boolean;
  failures: string[];
}

/**
 * Send to every device belonging to one person.
 *
 * allSettled, never all: one dead endpoint must not abort the others. The claim
 * is only released if *nothing* got through and at least one target asked to
 * retry — if one phone received it, the nudge was delivered.
 */
export async function fanOut(targets: PushTarget[], payload: PushPayload): Promise<FanOutResult> {
  const settled = await Promise.allSettled(targets.map((t) => sendOne(t, payload)));
  const result: FanOutResult = { sent: 0, gone: [], retry: false, failures: [] };

  settled.forEach((s, i) => {
    if (s.status === "rejected") {
      result.failures.push(`${targets[i].endpoint}: ${String(s.reason)}`);
      return;
    }
    const o = s.value;
    if (o.status === "sent") result.sent++;
    else if (o.status === "gone") result.gone.push(targets[i].endpoint);
    else if (o.status === "retry") result.retry = true;
    else result.failures.push(`${o.code} ${o.message}`);
  });

  if (result.sent > 0) result.retry = false;
  return result;
}
