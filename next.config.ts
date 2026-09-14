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
  /**
   * CROSS-ORIGIN ISOLATION, which is what buys a SharedArrayBuffer.
   *
   * The sim's draw-side arrays are allocated on shared memory when the page
   * can have it (game/shared.ts), which is what lets the renderer read the
   * world from the thread the sim is NOT on without copying. A browser only
   * hands out shared memory to a page that is cross-origin isolated, and a
   * page is only that if it says so in these two headers.
   *
   * The Electron shell the game ships in gives it without asking, so this is
   * for `npm run dev:web` — a bare tab, which would otherwise quietly take
   * the unshared fallback and never exercise the path that ships.
   *
   * THE COST IS REAL: a cross-origin isolated page cannot load a
   * cross-origin resource that does not opt in (CORP/CORS). Nothing here
   * does — every sprite, map and level document is served from this origin —
   * so it is free today, and the day something external is embedded it will need a
   * header of its own rather than this one being dropped.
   *
   * Headers are a server feature, so the static export skips them: there
   * the shell is the server (see desktop/), and it sets its own.
   */
  ...(isStatic
    ? null
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
                { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
