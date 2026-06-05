"use client";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0c0b0a", color: "#f4eee4", fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", textAlign: "center" }}>
        <div style={{ padding: 32, maxWidth: 340 }}>
          <div style={{ fontSize: 15, color: "rgba(244,238,228,0.56)", marginBottom: 6 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: "rgba(244,238,228,0.30)", marginBottom: 24, fontFamily: "monospace" }}>
            {error.digest ?? "unknown error"}
          </div>
          <button
            onClick={() => unstable_retry()}
            style={{
              background: "#d2734e", color: "#1a0f06", border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 15, fontWeight: 600,
              padding: "13px 28px", borderRadius: 16,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
