import { screen } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * HOW THE WINDOW WAS LAST SHOWN. Its windowed size and position, which of
 * the three display modes it was in, and which monitor it was on — kept in
 * window.json beside the save and restored at launch.
 *
 * The SIZE stored is always the windowed one, even for a save written
 * while the game was fullscreen or borderless: it is the size to come back
 * to. A position that no longer lands on a display (a monitor unplugged)
 * is dropped and the OS places the window; a monitor id that is no longer
 * there is dropped the same way and the game opens on the primary.
 *
 * This file is NOT Steam Cloud synced (see docs/desktop.md): where the
 * window sits is a fact about the machine, not about the campaign.
 */

/**
 * THE THREE WAYS THE GAME FILLS A SCREEN, picked on the Video tab of
 * Settings and applied by display.ts:
 *
 * - `windowed` — an ordinary window with a frame, at the remembered size
 * - `borderless` — a frameless window covering the whole monitor: it looks
 *   like fullscreen, but it is still a window, so alt-tab is instant and
 *   the cursor is free to leave for another screen
 * - `fullscreen` — the platform's own fullscreen (a Space on macOS, the
 *   window manager's fullscreen elsewhere)
 */
export type DisplayMode = "windowed" | "borderless" | "fullscreen";

export const DISPLAY_MODES: readonly DisplayMode[] = ["windowed", "borderless", "fullscreen"];

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  mode: DisplayMode;
  /**
   * The monitor the game was on, as Electron's display id. Absent means
   * "wherever the window lands" — a fresh install, or a save whose monitor
   * is no longer plugged in.
   */
  displayId?: number;
}

const FILE = "window.json";
export const DEFAULT_STATE: WindowState = { width: 1600, height: 900, mode: "windowed" };

/** the mode out of a raw file, migrating the boolean `fullscreen` it used to be */
function readMode(s: { mode?: unknown; fullscreen?: unknown }): DisplayMode {
  if (typeof s.mode === "string" && (DISPLAY_MODES as readonly string[]).includes(s.mode)) {
    return s.mode as DisplayMode;
  }
  return s.fullscreen === true ? "fullscreen" : "windowed";
}

export function loadWindowState(userData: string): WindowState {
  let s: Partial<WindowState> & { fullscreen?: unknown } = {};
  try {
    s = JSON.parse(fs.readFileSync(path.join(userData, FILE), "utf8"));
  } catch {
    return { ...DEFAULT_STATE };
  }
  const out: WindowState = {
    width: Math.max(960, Math.floor(Number(s.width) || DEFAULT_STATE.width)),
    height: Math.max(600, Math.floor(Number(s.height) || DEFAULT_STATE.height)),
    mode: readMode(s),
  };
  const displays = screen.getAllDisplays();
  if (typeof s.displayId === "number" && displays.some((d) => d.id === s.displayId)) {
    out.displayId = s.displayId;
  }
  if (typeof s.x === "number" && typeof s.y === "number") {
    const onScreen = displays.some((d) => {
      const a = d.workArea;
      return (
        s.x! + out.width > a.x + 64 &&
        s.x! < a.x + a.width - 64 &&
        s.y! >= a.y - 8 &&
        s.y! < a.y + a.height - 64
      );
    });
    if (onScreen) {
      out.x = Math.floor(s.x);
      out.y = Math.floor(s.y);
    }
  }
  return out;
}

export function saveWindowState(userData: string, state: WindowState): void {
  try {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(path.join(userData, FILE), JSON.stringify(state), "utf8");
  } catch {
    // cosmetic — the next launch opens at the default size
  }
}
