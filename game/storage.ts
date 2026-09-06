/**
 * WHERE THE SAVE FILE LIVES. One slot, one string — the JSON that
 * progress.ts writes — and two backends behind the same three calls:
 *
 * - THE BROWSER: localStorage, under KEY. A browser that played the game
 *   under its old name still holds a campaign under LEGACY_KEY, so a read
 *   falls back to it and the next write moves the campaign under KEY.
 *   Removable once no live install predates the rename.
 * - THE DESKTOP SHELL: a file on disk, through the bridge the Electron
 *   preload puts on `window` (desktop/src/preload.ts). The read is
 *   synchronous over IPC because it happens once, at boot, and every
 *   caller of loadProgress is written for a value, not a promise; the
 *   writes are fire-and-forget. Steam Cloud picks the file up from there.
 *
 * Neither backend is allowed to throw: a private window, a blocked
 * storage, a read-only disk — the run still plays, nothing sticks.
 */

const KEY = "mechswarm.progress.v1";
const LEGACY_KEY = "dagger-problem.progress.v1";

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
    return localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
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
    else {
      localStorage.removeItem(KEY);
      localStorage.removeItem(LEGACY_KEY); // or the pre-rename save would reappear
    }
  } catch {
    // ignore — same storage caveat as writeSave
  }
}
