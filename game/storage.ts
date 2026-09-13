/**
 * WHERE THE SAVE FILE LIVES — and, on a desktop, the one other thing the
 * shell lets the game touch: the window it is running in (displayControls
 * at the bottom, which the Video tab of Settings is drawn from).
 *
 * The save is one slot, one string — the JSON that progress.ts writes —
 * and two backends behind the same three calls:
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

const KEY = "animechs.progress.v1";
/** the same slot under the name the game had before the animal mechs */
const FORMER_KEY = "mechswarm.progress.v1";

/**
 * HOW THE WINDOW FILLS A SCREEN — the Video tab's three choices, applied
 * by the shell (desktop/src/display.ts). `borderless` is a frameless
 * window the size of the monitor: it looks like fullscreen but stays a
 * window, so alt-tab is instant and the cursor is free to leave for
 * another screen.
 */
export type DisplayMode = "windowed" | "borderless" | "fullscreen";

/** one monitor, as the Video tab prints it */
export interface DisplayInfo {
  id: number;
  label: string;
  width: number;
  height: number;
  primary: boolean;
}

/** what the shell says about the display right now */
export interface DisplayState {
  mode: DisplayMode;
  /** the monitor the game is on — always one of `displays` */
  displayId: number;
  displays: DisplayInfo[];
}

/**
 * THE DISPLAY CONTROLS. Read once when the tab opens, then subscribe:
 * every later state arrives on `onChange`, whether the tab asked for it,
 * F11 did, or a monitor was unplugged. `onChange` returns its own
 * unsubscribe.
 */
export interface DisplayBridge {
  get(): DisplayState | null;
  setMode(mode: DisplayMode): void;
  setMonitor(id: number): void;
  onChange(fn: (state: DisplayState) => void): () => void;
}

/** the shape the desktop preload exposes — keep in step with desktop/src/preload.ts */
export interface DesktopBridge {
  platform: "win32" | "darwin" | "linux";
  saves: {
    read(): string | null;
    write(json: string): void;
    clear(): void;
  };
  /** optional: a shell packaged before the Video tab existed has no display controls */
  display?: DisplayBridge;
  /** optional: a shell packaged before the menu had an Exit button cannot be told to quit */
  app?: { quit(): void };
  steam: {
    /** true when the shell is running under a Steam client */
    available: boolean;
    unlockAchievement(id: string): void;
  };
}

declare global {
  interface Window {
    animechsDesktop?: DesktopBridge;
  }
}

/** the desktop bridge, when this is the desktop build */
export function desktop(): DesktopBridge | undefined {
  return typeof window === "undefined" ? undefined : window.animechsDesktop;
}

/**
 * The display controls, when there is a shell to control. Undefined in a
 * browser tab, where the window is the browser's business — which is what
 * hides the Video tab of Settings on the web build.
 */
export function displayControls(): DisplayBridge | undefined {
  return desktop()?.display;
}

/**
 * Whether there is a window of ours to close — the menu's Exit button is
 * only drawn when there is. In a browser tab the tab is the player's own
 * (and script cannot close one it did not open), so the game does not
 * offer to quit something it cannot quit.
 */
export function canQuit(): boolean {
  return desktop()?.app !== undefined;
}

/** close the game, after the game's own confirmation has been answered */
export function quitGame(): void {
  desktop()?.app?.quit();
}

export function readSave(): string | null {
  try {
    const d = desktop();
    if (d) return d.saves.read();
    const json = localStorage.getItem(KEY);
    if (json !== null) return json;
    // a tab that has a campaign under the old name keeps it: move the
    // slot across on the first read, so the next write lands in one place
    const former = localStorage.getItem(FORMER_KEY);
    if (former !== null) {
      localStorage.setItem(KEY, former);
      localStorage.removeItem(FORMER_KEY);
    }
    return former;
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
      localStorage.removeItem(FORMER_KEY);
    }
  } catch {
    // ignore — same storage caveat as writeSave
  }
}
