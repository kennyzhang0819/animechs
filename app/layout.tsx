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
  title: "Sir, We Have a Dagger Problem",
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
        {/* the build stamp: the only proof of WHICH build this browser is
            running — see game/version.ts, and bump it every change */}
        <div className="pointer-events-none fixed bottom-[calc(0.375rem+var(--safe-b))] right-[calc(0.5rem+var(--safe-r))] z-50 text-[10px] text-[#5A5A63]">
          v{BUILD}
        </div>
      </body>
    </html>
  );
}
