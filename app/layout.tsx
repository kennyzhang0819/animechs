import type { Metadata, Viewport } from "next";
import { Jersey_20, Silkscreen } from "next/font/google";
import AdminShortcut from "@/components/AdminShortcut";
import CrashGuard from "@/components/CrashGuard";
import { BUILD } from "@/game/version";
import "./globals.css";

// THE DISPLAY FACE: a bitmap face. Every heading, label, button and
// number in the kit is set in it, on the same pixel grid the turret
// sprites are drawn at (app/globals.css, THE KIT).
const display = Silkscreen({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-display",
});

// THE BODY FACE: a pixel sans that is still a sans — descriptions, the
// codex and the settings rows are read as sentences, and a bitmap face
// at paragraph length is not. It is also the face EVERY NUMBER wears:
// Pixelify Sans was tried first and its 2, 5 and 8 shared almost every
// pixel, so a price read wrong at a glance. Jersey's digits are drawn to
// differ. One weight: a pixel face must never be faux-bolded (see
// font-synthesis in globals.css), so bold on this face is the same face.
const body = Jersey_20({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-body",
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
      <body className={`${display.variable} ${body.variable} font-body font-medium bg-[#0B0B0D] text-[18px] leading-snug text-[#D8D4CA]`}>
        <AdminShortcut />
        {/* a throw out of the game's own loop or a dropped promise never
            reaches a React boundary — this catches both and puts the fault
            screen over the whole app (components/CrashGuard.tsx) */}
        <CrashGuard />
        {children}
        {/* the build stamp: the only proof of WHICH build this browser is
            running — see game/version.ts, and bump it every change */}
        <div className="ui-zoom pointer-events-none fixed bottom-[0.375rem] right-[0.5rem] z-50 font-display text-[9px] text-[#5A5A63]">
          v{BUILD}
        </div>
      </body>
    </html>
  );
}
