import { contextBridge, ipcRenderer } from "electron";

/**
 * THE BRIDGE — the whole of what the game can reach from the shell,
 * placed on window.mechswarmDesktop. game/storage.ts reads it for the
 * save; nothing else in the game knows it is on a desktop.
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
  steam: {
    available: ipcRenderer.sendSync("steam:available") === true,
    unlockAchievement: (id: string): void => ipcRenderer.send("steam:achievement", String(id)),
  },
};

contextBridge.exposeInMainWorld("mechswarmDesktop", bridge);
