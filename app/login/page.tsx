"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Icon } from "@/components/ui";

type Mode = "email" | "sent" | "invite";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendMagicLink() {
    if (!email.trim()) return;
    setLoading(true); setError("");
    const sb = createClient();
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setMode("sent");
  }

  async function joinWithCode() {
    if (!email.trim() || !inviteCode.trim()) return;
    setLoading(true); setError("");
    // Pass the invite code as a query param so the callback API can handle household joining
    const sb = createClient();
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?invite=${encodeURIComponent(inviteCode.trim())}`,
      },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setMode("sent");
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

        {mode === "sent" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ color: "var(--good)", display: "inline-flex", marginBottom: 14 }}>
              <Icon name="check" size={36} stroke={2} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>Check your email</h2>
            <p style={{ fontSize: 14, color: "var(--ink-dim)", marginTop: 8, lineHeight: 1.5 }}>
              We sent a sign-in link to <strong style={{ color: "var(--ink)" }}>{email}</strong>
            </p>
            <button
              className="btn btn-ghost"
              style={{ marginTop: 20, display: "inline-flex" }}
              onClick={() => setMode("email")}
            >
              Try a different email
            </button>
          </div>
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
                onKeyDown={(e) => e.key === "Enter" && (mode === "email" ? sendMagicLink() : joinWithCode())}
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 13,
                  background: "var(--surface-2)", border: "1px solid var(--line)",
                  color: "var(--ink)", fontFamily: "var(--font-ui)", fontSize: 15.5, outline: "none",
                }}
              />

              {mode === "invite" && (
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
                onClick={mode === "invite" ? joinWithCode : sendMagicLink}
              >
                {loading ? "Sending…" : mode === "invite" ? "Join household" : "Send sign-in link"}
              </button>
            </div>

            <div style={{ textAlign: "center", marginTop: 18 }}>
              {mode === "email" ? (
                <button
                  className="btn btn-ghost"
                  style={{ display: "inline-flex", fontSize: 13.5, color: "var(--ink-faint)" }}
                  onClick={() => setMode("invite")}
                >
                  <Icon name="plus" size={15} stroke={2} /> Join someone&apos;s household
                </button>
              ) : (
                <button
                  className="btn btn-ghost"
                  style={{ display: "inline-flex", fontSize: 13.5, color: "var(--ink-faint)" }}
                  onClick={() => setMode("email")}
                >
                  Create my own household instead
                </button>
              )}
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
