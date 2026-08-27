import type { Metadata } from "next";
import { Chakra_Petch, IBM_Plex_Mono } from "next/font/google";
import AdminShortcut from "@/components/AdminShortcut";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable} font-mono font-medium bg-[#0B0B0D] text-[15px] leading-snug text-[#C9C9D4] antialiased`}>
        <AdminShortcut />
        {children}
      </body>
    </html>
  );
}
