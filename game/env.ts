/**
 * Whether the admin tools — the /admin page (map, level and balance
 * editors), the Ctrl+Shift+M shortcut that opens it, the three API routes
 * they save through, the window.__mechswarm / __swarmeditor debug handles
 * and the dev unlock (progress.ts) — exist in this build.
 *
 * ONE SWITCH, READ EVERYWHERE. They are development tools that write files
 * back into the repo, and a shipped game must have no way in — not a way in
 * that fails at the save button. Every gate in the tree reads this constant
 * rather than NODE_ENV, so there is exactly one place that decides.
 *
 * WHY IT IS NOT JUST "NOT PRODUCTION". The development loop runs a
 * PRODUCTION build (scripts/desktop-dev.mjs: next build + next start, so
 * what is played is what ships, at shipped speed), and the tools have to
 * come along with it. So the loop sets NEXT_PUBLIC_ADMIN=1 at build time
 * and this is on; the static export for the desktop shell and Steam
 * (build-static.sh) never sets it, so there this folds to `false` and the
 * tools are compiled out. NEXT_PUBLIC_ variables are inlined by Next at
 * build time, which is what makes that a constant rather than a runtime
 * check — and what makes the API routes, which read it at request time,
 * agree with the UI that was built against it.
 */
export const ADMIN_ENABLED =
  process.env.NEXT_PUBLIC_ADMIN === "1" || process.env.NODE_ENV !== "production";
