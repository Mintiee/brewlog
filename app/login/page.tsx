"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Icon } from "@/components/ui";

type Step = "request" | "verify";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("request");
  const [joining, setJoining] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendCode() {
    if (!email.trim()) return;
    if (joining && !inviteCode.trim()) { setError("Enter the household invite code."); return; }
    setLoading(true); setError("");
    const sb = createClient();
    // No emailRedirectTo — we want a typed 6-digit code, not a clickable link
    // (links get consumed by email prefetch/scanners before the user clicks them).
    const { error } = await sb.auth.signInWithOtp({ email: email.trim() });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setStep("verify");
  }

  async function verifyCode() {
    if (code.trim().length < 6) return;
    setLoading(true); setError("");
    const sb = createClient();
    const { error } = await sb.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setLoading(false);
      setError(error.message.includes("expired") ? "That code is invalid or expired. Request a new one." : error.message);
      return;
    }
    // Session is now set. Create or join the household before entering the app.
    try {
      const res = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(joining ? { invite_code: inviteCode.trim() } : {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoading(false);
        setError(body.error ?? "Could not set up your household. Try again.");
        return;
      }
    } catch {
      setLoading(false);
      setError("Network error setting up your household. Try again.");
      return;
    }
    // Full navigation so the server picks up the new session cookie.
    window.location.href = "/";
  }

  return (
    <div style={{
      minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "32px 20px",
      fontFamily: "var(--font-ui)",
    }}>
      <div style={{ width: "100%", maxWidth: 390 }}>
        {/* Logo / wordmark */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ color: "var(--accent)", display: "inline-flex", marginBottom: 12 }}>
            <Icon name="brew" size={40} stroke={1.4} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Brew</h1>
          <p style={{ fontSize: 13.5, color: "var(--ink-dim)", marginTop: 6 }}>Pour-over logging & shelf</p>
        </div>

        {step === "verify" ? (
          <>
            <div className="card" style={{ padding: "20px 20px 8px" }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 4 }}>Enter your code</h2>
              <p style={{ fontSize: 13.5, color: "var(--ink-dim)", marginBottom: 14, lineHeight: 1.5 }}>
                We sent a 6-digit code to <strong style={{ color: "var(--ink)" }}>{email}</strong>
              </p>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 13,
                  background: "var(--surface-2)", border: "1px solid var(--line)",
                  color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 22,
                  letterSpacing: "0.3em", textAlign: "center", outline: "none",
                }}
              />

              {error && (
                <p style={{ fontSize: 12.5, color: "#c9755f", marginTop: 8 }}>{error}</p>
              )}

              <button
                className="btn btn-accent"
                style={{ marginTop: 16, opacity: loading || code.length < 6 ? 0.6 : 1 }}
                disabled={loading || code.length < 6}
                onClick={verifyCode}
              >
                {loading ? "Verifying…" : "Verify & sign in"}
              </button>
            </div>

            <div style={{ textAlign: "center", marginTop: 18 }}>
              <button
                className="btn btn-ghost"
                style={{ display: "inline-flex", fontSize: 13.5, color: "var(--ink-faint)" }}
                onClick={() => { setStep("request"); setCode(""); setError(""); }}
              >
                Use a different email
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="card" style={{ padding: "20px 20px 8px" }}>
              <div className="label" style={{ marginBottom: 8 }}>Your email</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                inputMode="email"
                autoComplete="email"
                onKeyDown={(e) => e.key === "Enter" && sendCode()}
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 13,
                  background: "var(--surface-2)", border: "1px solid var(--line)",
                  color: "var(--ink)", fontFamily: "var(--font-ui)", fontSize: 15.5, outline: "none",
                }}
              />

              {joining && (
                <>
                  <div className="label" style={{ marginTop: 14, marginBottom: 8 }}>Household invite code</div>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    style={{
                      width: "100%", padding: "12px 14px", borderRadius: 13,
                      background: "var(--surface-2)", border: "1px solid var(--line)",
                      color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 16,
                      letterSpacing: "0.15em", outline: "none",
                    }}
                  />
                </>
              )}

              {error && (
                <p style={{ fontSize: 12.5, color: "#c9755f", marginTop: 8 }}>{error}</p>
              )}

              <button
                className="btn btn-accent"
                style={{ marginTop: 16, opacity: loading ? 0.6 : 1 }}
                disabled={loading}
                onClick={sendCode}
              >
                {loading ? "Sending…" : "Send sign-in code"}
              </button>
            </div>

            <div style={{ textAlign: "center", marginTop: 18 }}>
              <button
                className="btn btn-ghost"
                style={{ display: "inline-flex", fontSize: 13.5, color: "var(--ink-faint)" }}
                onClick={() => { setJoining(!joining); setError(""); }}
              >
                {joining ? "Create my own household instead" : <><Icon name="plus" size={15} stroke={2} /> Join someone&apos;s household</>}
              </button>
            </div>

            <p style={{ fontSize: 11.5, color: "var(--ink-faint)", textAlign: "center", marginTop: 20, lineHeight: 1.5 }}>
              Two people share one shelf and brew log — each rates and logs as themselves.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
