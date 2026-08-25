import type { Metadata } from "next";
import { Chakra_Petch, IBM_Plex_Mono } from "next/font/google";
import AdminShortcut from "@/components/AdminShortcut";
import "./globals.css";

const display = Chakra_Petch({
  weight: "600",
  subsets: ["latin"],
  variable: "--font-display",
});

const mono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Swarmfield",
  description:
    "Flow-field pathfinding demo: thousands of swarm units, WebGL instanced rendering, and towers that reroute the horde in real time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable} font-mono bg-[#070B14] text-[13px] text-[#9AA7C7] antialiased`}>
        <AdminShortcut />
        {children}
      </body>
    </html>
  );
}
