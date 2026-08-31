/**
 * Browser side of the push nudges: permission, subscription, and keeping the
 * stored timezone honest.
 *
 * Everything here is best-effort and swallows failures — a browser that can't
 * do push (a Safari tab that isn't installed to the Home Screen, a private
 * window, a locked-down profile) must degrade to "notifications just don't
 * happen", never to a broken app.
 */

export interface NudgeState {
  logNudge: boolean;
  rateNudge: boolean;
  /** Learned fire time, e.g. "7:45am", or null for "no pattern yet". */
  morning: string | null;
  arvo: string | null;
  vapidPublicKey: string | null;
}

/** Can this browser do Web Push at all? On iOS this is only true once the app
 *  has been added to the Home Screen. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function permission(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

/** VAPID keys travel as base64url; pushManager.subscribe wants raw bytes.
 *  Typed against a plain ArrayBuffer because BufferSource excludes the
 *  SharedArrayBuffer-backed view that `new Uint8Array(n)` widens to. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function keyOf(sub: PushSubscription, name: "p256dh" | "auth"): string {
  const key = sub.getKey(name);
  if (!key) return "";
  return btoa(String.fromCharCode(...new Uint8Array(key)));
}

export async function fetchState(): Promise<NudgeState | null> {
  try {
    const res = await fetch("/api/notify/subscribe", { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as NudgeState;
  } catch {
    return null;
  }
}

async function postSubscription(sub: PushSubscription): Promise<boolean> {
  try {
    const res = await fetch("/api/notify/subscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: keyOf(sub, "p256dh"),
        auth: keyOf(sub, "auth"),
        // Re-sent on every app open, so the stored zone follows the device
        // across travel and DST rather than going stale.
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ask for permission and subscribe. MUST be called synchronously from a real
 * user gesture — iOS rejects a permission prompt that isn't.
 */
export async function enablePush(vapidPublicKey: string): Promise<"granted" | "denied" | "unsupported" | "error"> {
  if (!pushSupported()) return "unsupported";
  let perm: NotificationPermission;
  try {
    perm = await Notification.requestPermission();
  } catch {
    return "error";
  }
  if (perm !== "granted") return "denied";

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));
    return (await postSubscription(sub)) ? "granted" : "error";
  } catch {
    return "error";
  }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch(`/api/notify/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {});
    await sub.unsubscribe();
  } catch {
    /* ignore */
  }
}

export async function setNudgePref(prefs: { logNudge?: boolean; rateNudge?: boolean }): Promise<void> {
  try {
    await fetch("/api/notify/subscribe", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
  } catch {
    /* ignore */
  }
}

/**
 * Called on every app open. Re-asserts an existing subscription so the stored
 * endpoint, keys and timezone stay current — endpoints rotate, and a phone that
 * flew somewhere needs its zone updated before the next morning nudge.
 * Never prompts: if permission was never granted, this does nothing.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await postSubscription(sub);
  } catch {
    /* ignore */
  }
}
