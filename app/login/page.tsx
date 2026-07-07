"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";
import { fetchProfile } from "@/lib/db";
import { Icon } from "@/components/ui";

// Email + 6-digit OTP sign-in. Flow:
//   1. email   → signInWithOtp (sends a 6-digit code)
//   2. code    → verifyOtp → session
//      then check for an existing profile: if the user is already a household
//      member, go straight in; otherwise
//   3. join    → name + invite code → POST /api/household → in.
const EMAIL_KEY = "brew_email"; // remember the last email for convenience

type Step = "email" | "code" | "join";

const ERR_COLOR = "#c9755f";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch { /* ignore */ }
  }, []);

  // Autofocus the field that just appeared.
  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
    if (step === "join") nameRef.current?.focus();
  }, [step]);

  function friendlyAuthError(message: string): string {
    const m = message.toLowerCase();
    if (m.includes("rate") || m.includes("limit") || m.includes("too many") || m.includes("seconds"))
      return "Too many attempts — wait a minute, then try again.";
    if (m.includes("expired")) return "That code has expired. Request a new one.";
    if (m.includes("invalid") || m.includes("token")) return "That code isn't right. Check it and try again.";
    return message || "Something went wrong. Try again.";
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr) { setError("Enter your email address."); return; }
    setBusy(true); setError(""); setInfo("");
    try {
      const sb = createClient();
      const { error: err } = await sb.auth.signInWithOtp({
        email: addr,
        options: { shouldCreateUser: true },
      });
      if (err) throw err;
      try { localStorage.setItem(EMAIL_KEY, addr); } catch { /* ignore */ }
      setEmail(addr);
      setCode("");
      setStep("code");
      setInfo(`We sent a 6-digit code to ${addr}.`);
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : ""));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e?: React.FormEvent) {
    e?.preventDefault();
    const token = code.trim();
    if (token.length < 6) { setError("Enter the 6-digit code."); return; }
    setBusy(true); setError(""); setInfo("");
    try {
      const sb = createClient();
      const { data, error: err } = await sb.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "email",
      });
      if (err) throw err;
      const user = data.user;
      if (!user) throw new Error("Sign-in failed. Try again.");

      // Already a household member? Straight in. Otherwise collect name + code.
      const profile = await fetchProfile(user.id, sb);
      if (profile) {
        window.location.href = "/";
        return;
      }
      setStep("join");
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : ""));
      setBusy(false); // stay on the code step so they can retry
    }
  }

  async function joinHousehold(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = inviteCode.trim();
    if (!trimmedName) { setError("Enter your name."); return; }
    if (!trimmedCode) { setError("Enter the invite code."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, inviteCode: trimmedCode }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        if (res.status === 403) throw new Error("That invite code doesn't match a household.");
        throw new Error(b.error ?? "Could not join the household.");
      }
      // Full navigation so the server picks up the session cookie.
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 10,
    border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)",
    fontFamily: "var(--font-ui)", outline: "none",
  };

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
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>brewlog</h1>
          <p style={{ fontSize: 13.5, color: "var(--ink-dim)", marginTop: 6 }}>Pour-over logging &amp; shelf</p>
        </div>

        <div className="card" style={{ padding: 20 }}>
          {step === "email" && (
            <form onSubmit={sendCode}>
              <div className="label" style={{ marginBottom: 12, textAlign: "center" }}>Sign in with your email</div>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                disabled={busy}
              />
              <button
                type="submit"
                className="btn btn-accent"
                style={{ width: "100%", justifyContent: "center", fontSize: 16, marginTop: 12 }}
                disabled={busy}
              >
                {busy ? "Sending…" : "Send code"}
              </button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={verifyCode}>
              <div className="label" style={{ marginBottom: 12, textAlign: "center" }}>Enter your 6-digit code</div>
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                style={{ ...inputStyle, textAlign: "center", letterSpacing: "0.3em", fontSize: 22 }}
                disabled={busy}
              />
              <button
                type="submit"
                className="btn btn-accent"
                style={{ width: "100%", justifyContent: "center", fontSize: 16, marginTop: 12 }}
                disabled={busy}
              >
                {busy ? "Verifying…" : "Verify & continue"}
              </button>
              <button
                type="button"
                className="btn"
                style={{ width: "100%", justifyContent: "center", fontSize: 13.5, marginTop: 8 }}
                disabled={busy}
                onClick={() => { setStep("email"); setError(""); setInfo(""); }}
              >
                Use a different email
              </button>
            </form>
          )}

          {step === "join" && (
            <form onSubmit={joinHousehold}>
              <div className="label" style={{ marginBottom: 12, textAlign: "center" }}>Join your household</div>
              <input
                ref={nameRef}
                type="text"
                autoComplete="given-name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                disabled={busy}
              />
              <input
                type="text"
                autoCapitalize="characters"
                placeholder="Invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                style={{ ...inputStyle, marginTop: 10 }}
                disabled={busy}
              />
              <button
                type="submit"
                className="btn btn-accent"
                style={{ width: "100%", justifyContent: "center", fontSize: 16, marginTop: 12 }}
                disabled={busy}
              >
                {busy ? "Joining…" : "Join household"}
              </button>
            </form>
          )}

          {info && !error && (
            <p style={{ fontSize: 12.5, color: "var(--ink-dim)", marginTop: 12, textAlign: "center" }}>{info}</p>
          )}
          {error && (
            <p style={{ fontSize: 12.5, color: ERR_COLOR, marginTop: 12, textAlign: "center" }}>{error}</p>
          )}
        </div>

        <p style={{ fontSize: 11.5, color: "var(--ink-faint)", textAlign: "center", marginTop: 20, lineHeight: 1.5 }}>
          Two people share one shelf and brew log — each rates and logs as themselves.
        </p>
      </div>
    </div>
  );
}
