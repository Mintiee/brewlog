"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Icon } from "@/components/ui";

// No-auth test mode: pick who you are, no email/password. Auth returns later.
const PEOPLE = ["Min-Taec", "Kris"];
const REMEMBER_KEY = "brew_identity";

export default function LoginPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [remembered, setRemembered] = useState<string | null>(null);

  useEffect(() => {
    try { setRemembered(localStorage.getItem(REMEMBER_KEY)); } catch { /* ignore */ }
  }, []);

  async function enterAs(name: string) {
    setLoading(name); setError("");
    try {
      const sb = createClient();
      // Reuse an existing anonymous session if we have one; otherwise create it.
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const { error: signInErr } = await sb.auth.signInAnonymously();
        if (signInErr) throw signInErr;
      }
      // Join (or create + seed) the shared household under this name.
      const res = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Could not set up your household.");
      }
      try { localStorage.setItem(REMEMBER_KEY, name); } catch { /* ignore */ }
      // Full navigation so the server picks up the new session cookie.
      window.location.href = "/";
    } catch (e) {
      setLoading(null);
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    }
  }

  // Show the remembered person first, if any.
  const ordered = remembered
    ? [remembered, ...PEOPLE.filter((p) => p !== remembered)]
    : PEOPLE;

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
          <p style={{ fontSize: 13.5, color: "var(--ink-dim)", marginTop: 6 }}>Pour-over logging & shelf</p>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="label" style={{ marginBottom: 12, textAlign: "center" }}>Who&apos;s brewing?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ordered.map((name) => (
              <button
                key={name}
                className="btn btn-accent"
                style={{
                  width: "100%", justifyContent: "center", fontSize: 16,
                  opacity: loading && loading !== name ? 0.5 : 1,
                }}
                disabled={!!loading}
                onClick={() => enterAs(name)}
              >
                {loading === name ? "Setting up…" : name}
                {remembered === name && loading == null && (
                  <span style={{ fontSize: 12, color: "var(--ink-dim)", marginLeft: 8 }}>· last used</span>
                )}
              </button>
            ))}
          </div>

          {error && (
            <p style={{ fontSize: 12.5, color: "#c9755f", marginTop: 12, textAlign: "center" }}>{error}</p>
          )}
        </div>

        <p style={{ fontSize: 11.5, color: "var(--ink-faint)", textAlign: "center", marginTop: 20, lineHeight: 1.5 }}>
          Two people share one shelf and brew log — each rates and logs as themselves.
        </p>
      </div>
    </div>
  );
}
