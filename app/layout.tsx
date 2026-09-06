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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
        <div className="pointer-events-none fixed bottom-[0.375rem] right-[0.5rem] z-50 text-[10px] text-[#5A5A63]">
          v{BUILD}
        </div>
      </body>
    </html>
  );
}
