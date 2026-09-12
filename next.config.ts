import type { NextConfig } from "next";

// BUILD_TARGET=static produces a fully static bundle in out/ for the
// desktop shell (npm run build:static, see desktop/). The dev-only editor
// API routes can't exist in a static export, so build-static.sh builds
// from a staged copy of the tree with app/api deleted — the live tree,
// and any dev server watching it, is never touched.
const isStatic = process.env.BUILD_TARGET === "static";

const nextConfig: NextConfig = {
  // the game owns its own rAF loop and canvases — keep React/Next dev
  // machinery from interfering with it
  reactStrictMode: false, // no double-mounting the Game instance in dev
  devIndicators: false, // no dev badge overlaying the canvas
  ...(isStatic && { output: "export" as const }),
  // WHERE THE BUILD GOES. The development loop is a production build now
  // (scripts/desktop-dev.mjs), and several of those can be running on one
  // checkout at once — parallel sessions each on their own port. Two
  // `next build`s into one .next would corrupt each other, and `next
  // start` on one would serve whatever the other last wrote, so the loop
  // gives each port its own directory. Unset, this is Next's own default.
  ...(process.env.NEXT_DIST_DIR && { distDir: process.env.NEXT_DIST_DIR }),
};

export default nextConfig;
