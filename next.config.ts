import type { NextConfig } from "next";

// BUILD_TARGET=mobile produces a fully static bundle in out/ for the
// Capacitor shell (npm run build:mobile). The dev-only editor API routes
// can't exist in a static export, so build-mobile.sh sets them aside for
// the duration of the build.
const isMobile = process.env.BUILD_TARGET === "mobile";

const nextConfig: NextConfig = {
  // the game owns its own rAF loop and canvases — keep React/Next dev
  // machinery from interfering with it
  reactStrictMode: false, // no double-mounting the Game instance in dev
  devIndicators: false, // no dev badge overlaying the canvas
  ...(isMobile && { output: "export" as const }),
};

export default nextConfig;
