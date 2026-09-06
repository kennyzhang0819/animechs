import { ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * THE SAVE FILE. One slot — progress.json under the shell's data
 * directory — and the three calls the game's storage.ts makes on it over
 * IPC: read (synchronous, once at boot), write, clear.
 *
 * A write goes to a temp file and is renamed over the old one, and the
 * old one is kept as progress.bak.json first: a crash mid-write can only
 * ever leave a whole save or a whole backup, never half of either. A read
 * falls back to the backup when the save itself cannot be read.
 *
 * Steam Cloud is pointed at this directory from the Steamworks dashboard
 * (Auto-Cloud) — nothing here talks to Steam.
 */
const FILE = "progress.json";
const BACKUP = "progress.bak.json";
const MAX_BYTES = 4 * 1024 * 1024; // a save is a few kilobytes; anything near this is not one

export function savesDir(userData: string): string {
  return path.join(userData, "saves");
}

export function readSave(dir: string): string | null {
  for (const name of [FILE, BACKUP]) {
    try {
      return fs.readFileSync(path.join(dir, name), "utf8");
    } catch {
      // missing or unreadable: try the next
    }
  }
  return null;
}

export function writeSave(dir: string, json: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, FILE);
  const tmp = path.join(dir, `${FILE}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, json, "utf8");
  try {
    fs.copyFileSync(file, path.join(dir, BACKUP));
  } catch {
    // no previous save to keep
  }
  fs.renameSync(tmp, file);
}

export function clearSave(dir: string): void {
  for (const name of [FILE, BACKUP]) fs.rmSync(path.join(dir, name), { force: true });
}

export function installSaveHandlers(dir: string): void {
  ipcMain.on("saves:read", (event) => {
    event.returnValue = readSave(dir);
  });
  ipcMain.on("saves:write", (_event, json: unknown) => {
    if (typeof json !== "string" || json.length > MAX_BYTES) return;
    try {
      writeSave(dir, json);
    } catch (err) {
      console.error("save failed:", err);
    }
  });
  ipcMain.on("saves:clear", () => {
    try {
      clearSave(dir);
    } catch (err) {
      console.error("clearing the save failed:", err);
    }
  });
}
