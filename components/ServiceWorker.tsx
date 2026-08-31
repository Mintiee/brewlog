"use client";
import { useEffect } from "react";

/** Registers the service worker so the app is installable (Android/desktop Chrome). */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () =>
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        // Re-assert an existing push subscription on every app open: endpoints
        // rotate, and the stored IANA timezone has to follow the device or the
        // next morning nudge fires at the wrong local hour. Never prompts.
        .then(() => import("@/lib/notify/client").then((m) => m.syncPushSubscription()))
        .catch(() => {});
    // Register after load so it never competes with first paint.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
