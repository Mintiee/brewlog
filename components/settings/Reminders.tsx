"use client";
import { useCallback, useEffect, useState } from "react";
import { SSection, SRow, SToggle } from "./controls";
import {
  pushSupported, permission, fetchState, enablePush, disablePush, setNudgePref,
  type NudgeState,
} from "@/lib/notify/client";

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, color: "var(--ink-faint)", padding: "0 0 12px", lineHeight: 1.45 }}>
      {children}
    </div>
  );
}

const Divider = () => <div style={{ height: 1, background: "var(--line)" }} />;

/** Is this an installed PWA? iOS only allows Web Push from the home-screen app,
 *  so a Safari tab needs telling why the toggle isn't there. */
function installed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Reminders: two push nudges, both about the record rather than about brewing.
 *
 * The learned times are shown read-only on purpose — the app records and shows,
 * it doesn't take instructions about when you ought to have coffee. When there
 * isn't enough of a pattern the slot simply stays quiet and says so, rather than
 * falling back to an invented default.
 */
export function Reminders() {
  const [state, setState] = useState<NudgeState | null>(null);
  // Read the live permission during the first render rather than in an effect:
  // Settings is only ever mounted client-side (AppShell gates every tab behind a
  // hydration probe), so there is no server/client mismatch to worry about, and
  // an effect here would just cause a cascading render.
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(permission);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchState().then(setState);
  }, []);

  const toggleMaster = useCallback((on: boolean) => {
    if (busy) return;
    setBusy(true);
    if (!on) {
      void disablePush().then(() => { setPerm(permission()); setBusy(false); });
      return;
    }
    // Must stay inside the tap: iOS rejects a permission prompt that isn't
    // synchronously reached from a user gesture.
    const key = state?.vapidPublicKey;
    if (!key) { setBusy(false); return; }
    void enablePush(key).then(async (r) => {
      setPerm(permission());
      if (r === "granted") setState(await fetchState());
      setBusy(false);
    });
  }, [busy, state?.vapidPublicKey]);

  const flip = (patch: { logNudge?: boolean; rateNudge?: boolean }) => {
    setState((s) => (s ? { ...s, ...patch } : s));
    void setNudgePref(patch);
  };

  if (!pushSupported()) {
    return (
      <SSection label="Reminders">
        <div className="card" style={{ padding: "14px 16px" }}>
          <Hint>
            {installed()
              ? "This browser can't show notifications."
              : "Add brewlog to your Home Screen to get reminders — iOS only allows notifications from an installed app."}
          </Hint>
        </div>
      </SSection>
    );
  }

  const on = perm === "granted";

  return (
    <SSection label="Reminders">
      <div className="card" style={{ padding: "4px 16px 4px" }}>
        <SRow label="Send me reminders">
          <SToggle on={on} onChange={toggleMaster} />
        </SRow>
        {perm === "denied" && (
          <Hint>Notifications are blocked for brewlog. Turn them back on in your browser or system settings.</Hint>
        )}
        {!state?.vapidPublicKey && perm !== "denied" && (
          <Hint>Push isn&apos;t configured on the server yet.</Hint>
        )}

        {on && state && (
          <>
            <Divider />
            <SRow label="Rate a brew afterwards">
              <SToggle on={state.rateNudge} onChange={(v) => flip({ rateNudge: v })} />
            </SRow>
            <Hint>About 25 minutes after you log a cup, if it&apos;s still unrated.</Hint>

            <Divider />
            <SRow label="Ask if a coffee needs logging">
              <SToggle on={state.logNudge} onChange={(v) => flip({ logNudge: v })} />
            </SRow>
            <Hint>
              {state.morning || state.arvo ? (
                <>
                  Around{" "}
                  {[state.morning, state.arvo].filter(Boolean).join(" and ")}
                  {" — "}learned from when you actually brew, and only if nothing&apos;s logged by then.
                </>
              ) : (
                "Not enough of a pattern yet — this stays quiet until your brewing has a regular time."
              )}
            </Hint>
          </>
        )}
      </div>
    </SSection>
  );
}
