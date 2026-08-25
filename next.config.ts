import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the game owns its own rAF loop and canvases — keep React/Next dev
  // machinery from interfering with it
  reactStrictMode: false, // no double-mounting the Game instance in dev
  devIndicators: false, // no dev badge overlaying the canvas
};

export default nextConfig;
