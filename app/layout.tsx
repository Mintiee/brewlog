import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

// Keep the explicit `weight` arrays. Both families are variable fonts, so dropping the
// arrays to ship one variable file per family looks like an obvious win — it isn't, and
// it was measured: a variable font carries interpolation data for the entire 100-900
// axis, which costs more than the handful of static cuts actually used. Dropping them
// took the build from 128.3 KB to 148.0 KB total and, more importantly, from 64.5 KB to
// 73.4 KB of *preloaded* font bytes competing with first paint. Only add a weight here
// if the UI genuinely uses it.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--loaded-font-ui",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--loaded-font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "brewlog",
  description: "Pour-over logging & shelf app",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "brewlog" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // App-like PWA: lock pinch-zoom and the iOS input-focus auto-zoom, which left
  // the page stuck zoomed-in with weird scrolling after orientation changes.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0c0b0a",
};

/** Origin of the Supabase project, for the preconnect hint below. */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null; // unset in demo mode — skip the hint rather than emit a broken one
  }
})();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hanken.variable} ${jetbrains.variable}`} style={{ colorScheme: "dark" }}>
      <head>
        {/* The first client-side Supabase call (auth refresh, any mutation, the
            foreground refresh) otherwise pays DNS + TLS before it can even start.
            Warming the connection during HTML parse takes that off the critical path.
            Country outlines no longer need a hint — they're same-origin now, vendored
            into public/maps by scripts/fetch-outlines.mjs. */}
        {supabaseOrigin && (
          <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
        )}
      </head>
      <body>{children}<ServiceWorker /></body>
    </html>
  );
}
