/**
 * WHERE THE SAVE FILE LIVES. One slot, one string — the JSON that
 * progress.ts writes — and two backends behind the same three calls:
 *
 * - THE DESKTOP SHELL, which is the game: a file on disk, through the
 *   bridge the Electron preload puts on `window` (desktop/src/preload.ts).
 *   The read is synchronous over IPC because it happens once, at boot, and
 *   every caller of loadProgress is written for a value, not a promise;
 *   the writes are fire-and-forget. Steam Cloud picks the file up from
 *   there. `npm run dev` runs the dev server inside the shell, so
 *   development saves land in the same file.
 * - A BARE BROWSER TAB on the dev server, with no shell around it:
 *   localStorage, so the tab still has a campaign. Nothing ships this way.
 *
 * Neither backend is allowed to throw: a blocked storage, a read-only
 * disk — the run still plays, nothing sticks.
 */

const KEY = "mechswarm.progress.v1";

/** the shape the desktop preload exposes — keep in step with desktop/src/preload.ts */
export interface DesktopBridge {
  platform: "win32" | "darwin" | "linux";
  saves: {
    read(): string | null;
    write(json: string): void;
    clear(): void;
  };
  steam: {
    /** true when the shell is running under a Steam client */
    available: boolean;
    unlockAchievement(id: string): void;
  };
}

declare global {
  interface Window {
    mechswarmDesktop?: DesktopBridge;
  }
}

/** the desktop bridge, when this is the desktop build */
export function desktop(): DesktopBridge | undefined {
  return typeof window === "undefined" ? undefined : window.mechswarmDesktop;
}

export function readSave(): string | null {
  try {
    const d = desktop();
    if (d) return d.saves.read();
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeSave(json: string): void {
  try {
    const d = desktop();
    if (d) d.saves.write(json);
    else localStorage.setItem(KEY, json);
  } catch {
    // private windows / blocked storage: the run still plays, nothing sticks
  }
}

export function clearSave(): void {
  try {
    const d = desktop();
    if (d) d.saves.clear();
    else localStorage.removeItem(KEY);
  } catch {
    // ignore — same storage caveat as writeSave
  }
}
