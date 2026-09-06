import { type BrowserWindow, screen } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * WHERE THE WINDOW WAS. Size, position and whether it was fullscreen,
 * kept in window.json beside the save and restored at launch. A position
 * that no longer lands on a display (a monitor unplugged) is dropped and
 * the OS places the window.
 */
export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  fullscreen: boolean;
}

const FILE = "window.json";
export const DEFAULT_STATE: WindowState = { width: 1600, height: 900, fullscreen: false };

export function loadWindowState(userData: string): WindowState {
  let s: Partial<WindowState> = {};
  try {
    s = JSON.parse(fs.readFileSync(path.join(userData, FILE), "utf8"));
  } catch {
    return { ...DEFAULT_STATE };
  }
  const out: WindowState = {
    width: Math.max(960, Math.floor(Number(s.width) || DEFAULT_STATE.width)),
    height: Math.max(600, Math.floor(Number(s.height) || DEFAULT_STATE.height)),
    fullscreen: s.fullscreen === true,
  };
  if (typeof s.x === "number" && typeof s.y === "number") {
    const onScreen = screen.getAllDisplays().some((d) => {
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

export function saveWindowState(userData: string, win: BrowserWindow): void {
  const fullscreen = win.isFullScreen();
  // the size to come back to is the windowed one, even when closed fullscreen
  const b = fullscreen ? win.getNormalBounds() : win.getBounds();
  const state: WindowState = { width: b.width, height: b.height, x: b.x, y: b.y, fullscreen };
  try {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(path.join(userData, FILE), JSON.stringify(state), "utf8");
  } catch {
    // cosmetic — the next launch opens at the default size
  }
}
