/**
 * Whether the admin tools — the /admin page (map, level and balance
 * editors) and the Ctrl+Shift+M shortcut that opens it — exist in this
 * build.
 *
 * They are development tools: they write files back through /api/maps,
 * /api/levels and /api/balance, all three of which already refuse in a
 * production build. The UI now refuses in the same place, so a deployed
 * game has no way in rather than a way in that fails at the save button.
 *
 * NODE_ENV is inlined at build time, so a production bundle folds this to
 * a constant `false` — the check costs nothing at runtime.
 */
export const ADMIN_ENABLED = process.env.NODE_ENV !== "production";
