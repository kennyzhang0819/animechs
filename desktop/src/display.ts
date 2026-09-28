import {
  BaseWindow,
  ipcMain,
  screen,
  WebContentsView,
  type Display,
  type Rectangle,
  type WebContents,
} from "electron";
import { DISPLAY_MODES, type DisplayMode, type WindowState } from "./window-state";

/**
 * THE WINDOW, AND THE THREE WAYS IT FILLS A SCREEN — windowed, borderless,
 * fullscreen — plus which monitor it does that on. The Video tab of the
 * game's Settings drives all of it over IPC (installDisplayHandlers below,
 * `display` on the bridge in preload.ts).
 *
 * WHY THE GAME IS A VIEW INSIDE A WINDOW rather than a plain
 * BrowserWindow: Electron fixes a window's frame at construction — there
 * is no setFrame — so borderless means a different window from the framed
 * one. A WebContentsView can be moved from one window to another with the
 * page still running (rebuild below), so switching modes re-parents the
 * running game instead of reloading it. A player who changes the display
 * mode in the middle of a run keeps the run.
 *
 * The three modes, and what each one actually is:
 *
 * - `windowed` — a framed window at the remembered size, on the chosen
 *   monitor. Dragging it to another monitor makes that one the choice.
 * - `borderless` — a frameless window covering the whole monitor. It is
 *   still an ordinary window: alt-tab is instant, the cursor leaves for
 *   another screen freely, and nothing takes the display over. What most
 *   players want on a multi-monitor desk.
 * - `fullscreen` — the platform's own fullscreen: a Space on macOS, the
 *   window manager's fullscreen on Windows and Linux. Chromium has no
 *   exclusive/mode-setting fullscreen to offer, so this changes no
 *   resolution — it is fullscreen as the desktop means it.
 */

/** how long to wait for macOS to finish animating its way out of fullscreen */
const LEAVE_FULLSCREEN_MS = 1500;
/** how long to let a borderless move settle before checking it landed (landOn) */
const RELAND_MS = 120;

/** one monitor, as the Video tab prints it */
export interface DisplayInfo {
  id: number;
  /** the OS's name for it when it has one, else "Monitor 1", "Monitor 2", … */
  label: string;
  width: number;
  height: number;
  primary: boolean;
  /** the work area — what a framed window can actually fill */
  workWidth: number;
  workHeight: number;
}

/** everything the Video tab draws itself from */
export interface DisplayState {
  mode: DisplayMode;
  /** the monitor the game is on — always one of `displays` */
  displayId: number;
  displays: DisplayInfo[];
  /** the windowed size, whatever mode the window is in now */
  window: { width: number; height: number };
}

export interface ShellOptions {
  preload: string;
  background: string;
  title: string;
  minWidth: number;
  minHeight: number;
  /** where the last session left the window (window-state.ts) */
  state: WindowState;
  /** the player closed the window: the state to write to window.json */
  onClose(state: WindowState): void;
}

/**
 * WHICH MONITOR TO OPEN ON, before there is a window to ask: the
 * remembered one while it is still plugged in, else the one the remembered
 * position lands on (a window that lived on the second screen with no
 * monitor ever chosen belongs back on the second screen), else the primary.
 */
function openOn(s: WindowState): Display {
  const picked = screen.getAllDisplays().find((d) => d.id === s.displayId);
  if (picked) return picked;
  if (s.x !== undefined && s.y !== undefined) {
    return screen.getDisplayMatching({ x: s.x, y: s.y, width: s.width, height: s.height });
  }
  return screen.getPrimaryDisplay();
}

export class Shell {
  /** the game itself: one page, alive from launch to quit */
  readonly view: WebContentsView;
  private win: BaseWindow;
  private mode: DisplayMode;
  /** the mode F11 comes back to, so leaving fullscreen restores borderless */
  private restoreMode: Exclude<DisplayMode, "fullscreen">;
  /** the chosen monitor; undefined = whichever one the window is on */
  private displayId: number | undefined;
  /** the size and place to be in when windowed, kept up to date as it moves */
  private windowed: Rectangle;
  private framed: boolean;
  private shown = false;
  /**
   * IS THE MOVE OURS? While apply() is working, the window's own
   * fullscreen events are the moving parts of a mode being set, not the
   * player reaching for the green button — see follow().
   */
  private applying = false;

  constructor(private readonly opts: ShellOptions) {
    const s = opts.state;
    this.mode = s.mode;
    this.restoreMode = s.mode === "fullscreen" ? "windowed" : s.mode;
    this.displayId = s.displayId;
    this.windowed = this.place(openOn(s), s.width, s.height, s.x, s.y);
    this.framed = s.mode !== "borderless";
    this.view = new WebContentsView({
      webPreferences: {
        preload: opts.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    this.view.setBackgroundColor(opts.background);
    this.win = this.make(this.framed, this.windowed);
    this.win.contentView.addChildView(this.view);
    this.wire(this.win);
    this.apply();

    // a monitor plugged in or unplugged mid-session: the choice may have
    // just walked out of the room, and the tab is showing a list that no
    // longer exists
    const changed = (): void => this.displaysChanged();
    screen.on("display-added", changed);
    screen.on("display-removed", changed);
    screen.on("display-metrics-changed", changed);
  }

  get webContents(): WebContents {
    return this.view.webContents;
  }

  /** the window the game is in right now — it is replaced when the frame changes */
  window(): BaseWindow {
    return this.win;
  }

  show(): void {
    this.shown = true;
    this.win.show();
    this.view.webContents.focus();
  }

  focus(): void {
    if (this.win.isMinimized()) this.win.restore();
    this.win.focus();
  }

  /** what to write to window.json: the windowed size, the mode, the monitor */
  state(): WindowState {
    return { ...this.windowed, mode: this.mode, displayId: this.target().id };
  }

  displayState(): DisplayState {
    const primary = screen.getPrimaryDisplay();
    return {
      mode: this.mode,
      displayId: this.target().id,
      displays: screen.getAllDisplays().map((d, i) => ({
        id: d.id,
        label: d.label?.trim() ? d.label.trim() : `Monitor ${i + 1}`,
        width: Math.round(d.bounds.width),
        height: Math.round(d.bounds.height),
        primary: d.id === primary.id,
        workWidth: Math.round(d.workArea.width),
        workHeight: Math.round(d.workArea.height),
      })),
      window: { width: this.windowed.width, height: this.windowed.height },
    };
  }

  /**
   * The Window size row: the windowed size, re-centred on the monitor
   * (place() with no position). Only applied at once when windowed; the
   * other two modes keep it as the size to come back to.
   */
  setWindowSize(width: number, height: number): void {
    const w = Math.max(this.opts.minWidth, Math.floor(width));
    const h = Math.max(this.opts.minHeight, Math.floor(height));
    if (w === this.windowed.width && h === this.windowed.height) return;
    this.windowed = this.place(this.target(), w, h);
    if (this.mode === "windowed" && !this.win.isFullScreen()) this.win.setBounds(this.windowed);
    this.emit();
  }

  setMode(mode: DisplayMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode !== "fullscreen") this.restoreMode = mode;
    this.apply();
    this.emit();
  }

  /** play on this monitor — the mode comes along, whatever it is */
  setDisplay(id: number): void {
    if (!screen.getAllDisplays().some((d) => d.id === id)) return;
    if (id === this.target().id) return;
    this.displayId = id;
    this.apply();
    this.emit();
  }

  /** F11 and the View menu: fullscreen, and back to whatever it was before */
  toggleFullScreen(): void {
    this.setMode(this.mode === "fullscreen" ? this.restoreMode : "fullscreen");
  }

  /**
   * PUT THE WINDOW WHERE THE MODE SAYS. Fullscreen is left first whatever
   * happens next — bounds set on a fullscreen window are ignored, and the
   * frame cannot be swapped underneath one — and leaving it is ANIMATED on
   * macOS, so the rest of the move waits for the window to come back
   * rather than being thrown away mid-animation. The timeout is the
   * belt-and-braces for a platform that never reports the leave.
   */
  private apply(): void {
    this.applying = true;
    if (this.win.isFullScreen()) {
      let ran = false;
      const settle = (): void => {
        if (ran) return;
        ran = true;
        this.settle();
      };
      this.win.once("leave-full-screen", settle);
      setTimeout(settle, LEAVE_FULLSCREEN_MS);
      this.win.setFullScreen(false);
      return;
    }
    this.settle();
  }

  /** the half of apply() that needs a window which is not fullscreen */
  private settle(): void {
    const framed = this.mode !== "borderless";
    if (framed !== this.framed) this.rebuild(framed);
    const win = this.win;
    const target = this.target();
    if (this.mode === "windowed") {
      // the placement is remembered as it is applied: a window sent to
      // another monitor is where the next launch should open, and not
      // every platform reports a programmatic move back to us
      this.windowed = this.place(
        target,
        this.windowed.width,
        this.windowed.height,
        this.windowed.x,
        this.windowed.y,
      );
      win.setBounds(this.windowed);
    } else {
      // borderless and fullscreen both start by covering one whole
      // monitor; fullscreen then hands that window to the platform.
      //
      // NOTHING IS MADE UNRESIZABLE HERE, tempting as it is for a
      // borderless window with no edges to grab: on Windows a window that
      // is not resizable is pinned to the size it had, and setBounds onto
      // a monitor of another size — which is exactly what changing monitor
      // is — then does nothing at all.
      win.setBounds(target.bounds);
      if (this.mode === "fullscreen") win.setFullScreen(true);
      else this.landOn(target);
    }
    this.fit();
    this.applying = false;
  }

  /**
   * DID THE WINDOW ACTUALLY GO? A borderless move across monitors can be
   * adjusted under us — a display of another scale factor, a window
   * manager with its own opinion — and lands the window back where it
   * was. One re-try on the next tick is enough for every case seen; a
   * second would be a fight with the platform, which the platform wins.
   */
  private landOn(target: Display): void {
    setTimeout(() => {
      if (this.mode === "windowed" || this.win.isFullScreen()) return;
      const now = this.win.getBounds();
      const on = screen.getDisplayMatching(now);
      const fits = now.width === target.bounds.width && now.height === target.bounds.height;
      if (on.id !== target.id || !fits) this.win.setBounds(target.bounds);
      this.fit();
    }, RELAND_MS);
  }

  /**
   * SWAP THE FRAME. A new window of the other kind, the running game moved
   * into it, and only then the old one destroyed — the game never reloads,
   * and the window count never touches zero (which would quit the app).
   * destroy() rather than close() so nothing takes it for the player
   * closing the game.
   */
  private rebuild(framed: boolean): void {
    const old = this.win;
    const next = this.make(framed, old.getBounds());
    old.contentView.removeChildView(this.view);
    next.contentView.addChildView(this.view);
    this.win = next;
    this.framed = framed;
    this.wire(next);
    this.fit();
    if (this.shown) next.show();
    old.destroy();
    this.view.webContents.focus();
  }

  private make(framed: boolean, bounds: Rectangle): BaseWindow {
    return new BaseWindow({
      ...bounds,
      minWidth: this.opts.minWidth,
      minHeight: this.opts.minHeight,
      frame: framed,
      backgroundColor: this.opts.background,
      title: this.opts.title,
      show: false,
      autoHideMenuBar: true,
    });
  }

  private wire(win: BaseWindow): void {
    win.on("resize", () => {
      this.fit();
      this.remember();
    });
    win.on("move", () => this.remember());
    win.on("close", () => this.opts.onClose(this.state()));
    // the platform's own fullscreen — macOS's green button, a window
    // manager's shortcut — is the setting changing under us. Follow it,
    // rather than leaving the Video tab claiming something else
    win.on("enter-full-screen", () => this.follow("fullscreen"));
    win.on("leave-full-screen", () => this.follow(this.framed ? "windowed" : "borderless"));
  }

  private follow(mode: DisplayMode): void {
    if (this.applying || mode === this.mode) return;
    this.mode = mode;
    if (mode !== "fullscreen") this.restoreMode = mode;
    this.emit();
  }

  /** the game fills the window's content area, always */
  private fit(): void {
    const [width, height] = this.win.getContentSize();
    this.view.setBounds({ x: 0, y: 0, width, height });
  }

  /**
   * The window moved or was resized by hand. Only windowed bounds are
   * worth remembering — the other two modes are the monitor's own size —
   * and a window DRAGGED to another monitor makes that monitor the choice.
   */
  private remember(): void {
    if (this.mode !== "windowed" || this.win.isFullScreen()) return;
    const was = this.windowed;
    this.windowed = this.win.getBounds();
    const on = screen.getDisplayMatching(this.windowed).id;
    const resized = was.width !== this.windowed.width || was.height !== this.windowed.height;
    const moved = on !== this.displayId;
    this.displayId = on;
    if (moved || resized) this.emit();
  }

  /** the monitor to play on: the chosen one while it exists, else where the window is */
  private target(): Display {
    const picked = screen.getAllDisplays().find((d) => d.id === this.displayId);
    return picked ?? screen.getDisplayMatching(this.win.getBounds());
  }

  /**
   * A windowed rectangle on the given monitor: the remembered spot when it
   * is still on that monitor, else the remembered SIZE centred on it — a
   * window sent to another screen should land in the middle of it, not at
   * a corner it once had somewhere else.
   */
  private place(
    target: Display,
    width: number,
    height: number,
    x?: number,
    y?: number,
  ): Rectangle {
    const a = target.workArea;
    const w = Math.min(width, a.width);
    const h = Math.min(height, a.height);
    if (
      x !== undefined &&
      y !== undefined &&
      x >= a.x - 8 &&
      y >= a.y - 8 &&
      x + w <= a.x + a.width + 8 &&
      y + h <= a.y + a.height + 8
    ) {
      return { x, y, width: w, height: h };
    }
    return {
      x: Math.round(a.x + (a.width - w) / 2),
      y: Math.round(a.y + (a.height - h) / 2),
      width: w,
      height: h,
    };
  }

  private displaysChanged(): void {
    const gone =
      this.displayId !== undefined &&
      !screen.getAllDisplays().some((d) => d.id === this.displayId);
    if (gone) {
      // the monitor the game was told to play on has been unplugged:
      // target() falls back to where the window ended up, so re-applying
      // the mode is what pulls a borderless window onto a screen again
      this.displayId = undefined;
      this.apply();
    }
    this.emit();
  }

  private emit(): void {
    const wc = this.view.webContents;
    if (!wc.isDestroyed()) wc.send("display:changed", this.displayState());
  }
}

/**
 * The Video tab's side of the bridge: read the state once, set a mode, set
 * a monitor. Every change — from here, from F11, or from a monitor being
 * unplugged — comes back on `display:changed`.
 *
 * Takes the shell as a getter, not a value: these are registered once for
 * the life of the app, and on macOS the window (and with it the shell) can
 * be rebuilt after the last one was closed.
 */
export function installDisplayHandlers(current: () => Shell | null): void {
  ipcMain.on("display:state", (event) => {
    event.returnValue = current()?.displayState() ?? null;
  });
  ipcMain.on("display:mode", (_event, mode: unknown) => {
    if (typeof mode === "string" && (DISPLAY_MODES as readonly string[]).includes(mode)) {
      current()?.setMode(mode as DisplayMode);
    }
  });
  ipcMain.on("display:monitor", (_event, id: unknown) => {
    if (typeof id === "number" && Number.isFinite(id)) current()?.setDisplay(id);
  });
  ipcMain.on("display:size", (_event, width: unknown, height: unknown) => {
    if (
      typeof width === "number" &&
      typeof height === "number" &&
      Number.isFinite(width) &&
      Number.isFinite(height)
    ) {
      current()?.setWindowSize(width, height);
    }
  });
}
