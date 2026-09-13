import { contextBridge, ipcRenderer } from "electron";

/**
 * THE BRIDGE — the whole of what the game can reach from the shell,
 * placed on window.animechsDesktop. game/storage.ts reads it for the
 * save and the Video tab of Settings for the display; nothing else in the
 * game knows it is on a desktop.
 *
 * Sandboxed and context-isolated: this file may import only `electron`,
 * and the page never sees Node. Keep the shape in step with DesktopBridge
 * in game/storage.ts.
 */
const bridge = {
  platform: process.platform,
  saves: {
    read: (): string | null => ipcRenderer.sendSync("saves:read") as string | null,
    write: (json: string): void => ipcRenderer.send("saves:write", json),
    clear: (): void => ipcRenderer.send("saves:clear"),
  },
  /**
   * THE DISPLAY: how the window fills a screen, and which screen. `get` is
   * synchronous — the Video tab draws itself from it the moment it opens —
   * and `onChange` carries every later state, whether the tab asked for it
   * (setMode, setMonitor), F11 did, or a monitor was unplugged. It returns
   * the unsubscribe, which is what a React effect wants back.
   */
  display: {
    get: (): unknown => ipcRenderer.sendSync("display:state"),
    setMode: (mode: string): void => ipcRenderer.send("display:mode", mode),
    setMonitor: (id: number): void => ipcRenderer.send("display:monitor", id),
    onChange: (fn: (state: unknown) => void): (() => void) => {
      const listener = (_event: unknown, state: unknown): void => fn(state);
      ipcRenderer.on("display:changed", listener);
      return () => ipcRenderer.removeListener("display:changed", listener);
    },
  },
  /**
   * QUIT. The menu's Exit button, after the game's own confirmation — the
   * shell closes itself rather than the page trying to close a window it
   * does not own.
   */
  app: {
    quit: (): void => ipcRenderer.send("app:quit"),
  },
  steam: {
    available: ipcRenderer.sendSync("steam:available") === true,
    unlockAchievement: (id: string): void => ipcRenderer.send("steam:achievement", String(id)),
  },
};

contextBridge.exposeInMainWorld("animechsDesktop", bridge);
