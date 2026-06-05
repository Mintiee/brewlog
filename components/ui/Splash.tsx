/**
 * First-load splash — app icon above the "brewlog" wordmark on the warm-black bg.
 * Plain (no hooks/client APIs) so it renders identically from the server
 * `app/loading.tsx` and the client `Shell` not-ready state — no flash on handoff.
 */
export function Splash() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      <div
        className="splash-mark"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt=""
          width={88}
          height={88}
          style={{ borderRadius: 20, boxShadow: "var(--shadow)" }}
        />
        <span
          style={{
            fontFamily: "var(--font-ui)",
            color: "var(--ink)",
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          brewlog
        </span>
      </div>
    </div>
  );
}
