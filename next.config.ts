import type { NextConfig } from "next";

// BUILD_TARGET=static produces a fully static bundle in out/ for the
// desktop shell (npm run build:static, see desktop/). The dev-only editor
// API routes can't exist in a static export, so build-static.sh sets them
// aside for the duration of the build.
const isStatic = process.env.BUILD_TARGET === "static";

const nextConfig: NextConfig = {
  // the game owns its own rAF loop and canvases — keep React/Next dev
  // machinery from interfering with it
  reactStrictMode: false, // no double-mounting the Game instance in dev
  devIndicators: false, // no dev badge overlaying the canvas
  ...(isStatic && { output: "export" as const }),
};

export default nextConfig;
