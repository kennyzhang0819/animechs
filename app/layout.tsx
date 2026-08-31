import type { Metadata, Viewport } from "next";
import { Chakra_Petch, IBM_Plex_Mono } from "next/font/google";
import AdminShortcut from "@/components/AdminShortcut";
import { BUILD } from "@/game/version";
import "./globals.css";

const display = Chakra_Petch({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-display",
});

const mono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "MechSwarm",
  description:
    "Incremental swarm defense: every run banks resources toward a tech tree of towers and placements, across a campaign of worlds — thousands of units on a WebGL flow field.",
};

/**
 * The game owns every gesture on the page. Without this, a pinch on a phone
 * zooms the DOCUMENT — the HUD balloons off the screen and the map underneath
 * never moves — and a double tap does the same in one gesture. The canvas
 * reads pinches itself and drives the camera with them (see game/game.ts);
 * Safari ignores user-scalable, so Game also swallows its gesture events.
 *
 * viewport-fit=cover lets the map run under the notch and the home
 * indicator. The HUD stays clear of both through --safe-* in globals.css.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0B0B0D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable} font-mono font-medium bg-[#0B0B0D] text-[15px] leading-snug text-[#C9C9D4] antialiased`}>
        <AdminShortcut />
        {children}
        {/* THE ROTATE GATE, for phone BROWSERS only. The native shells are
            locked to landscape at the OS level (Info.plist / the Android
            manifest), but Safari has no orientation lock, so a phone held
            upright gets this sheet instead of a game squeezed into a
            portrait sliver. Pure CSS: globals.css shows it only under
            (portrait + coarse pointer + phone-narrow), which leaves
            desktops, iPads and every landscape phone untouched. */}
        <div className="rotate-gate fixed inset-0 z-[100] hidden flex-col items-center justify-center gap-4 bg-[#0B0B0D] px-8 text-center">
          <svg viewBox="0 0 24 24" className="h-12 w-12 text-[#FFD37F]" aria-hidden="true">
            <path
              fill="currentColor"
              d="M7 2h10a2 2 0 0 1 2 2v10h-2V4H7v3H5V4a2 2 0 0 1 2-2Zm-3 9h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm0 2v7h10v-7H4Zm16.5-6.8 1.4 1.42-3.1 3.08-1.4-1.4 3.1-3.1Z"
            />
          </svg>
          <div className="font-display text-lg font-bold uppercase tracking-[0.25em] text-[#EDEDEF]">
            Rotate your device
          </div>
          <p className="text-[13px] uppercase tracking-widest text-[#71717C]">
            MechSwarm plays in landscape
          </p>
        </div>
        {/* the build stamp: the only proof of WHICH build this browser is
            running — see game/version.ts, and bump it every change */}
        <div className="pointer-events-none fixed bottom-[calc(0.375rem+var(--safe-b))] right-[calc(0.5rem+var(--safe-r))] z-50 text-[10px] text-[#5A5A63]">
          v{BUILD}
        </div>
      </body>
    </html>
  );
}
