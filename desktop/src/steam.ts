import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * STEAMWORKS, behind a switch that is off until the game has an app id.
 *
 * The id comes from, in order: the SteamAppId variable Steam sets on
 * every process it launches; a steam_appid.txt beside the executable (or
 * in desktop/ during development), which is how the Steamworks SDK is
 * told what it is when the shell is launched outside Steam; and
 * STEAM_APP_ID below, for the shipped build. No id, no Steam: the shell
 * runs as a plain desktop game, which is what `npm run desktop` does on a
 * machine with no Steam client on it.
 *
 * With an id, and packaged, a launch from outside Steam hands off to
 * Steam and quits (restartAppIfNecessary) — the normal thing for a Steam
 * build. Then the client is initialised and the overlay is enabled:
 * steamworks.js needs Chromium's GPU work in-process for the overlay to
 * hook it, which is two command-line switches that have to be set before
 * the app is ready, so this runs at the top of main.ts.
 */

/** the app id Steam assigns on the partner site; 0 until then */
export const STEAM_APP_ID = 0;

type SteamworksModule = typeof import("steamworks.js");
type SteamClient = ReturnType<SteamworksModule["init"]>;

export interface Steam {
  appId: number;
  client: SteamClient;
}

function appIdFromFile(dir: string): number {
  try {
    const n = parseInt(fs.readFileSync(path.join(dir, "steam_appid.txt"), "utf8").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function resolveAppId(): number {
  const env = parseInt(process.env.SteamAppId ?? "", 10);
  if (Number.isFinite(env) && env > 0) return env;
  const fromFile = app.isPackaged
    ? appIdFromFile(path.dirname(process.execPath))
    : appIdFromFile(path.resolve(__dirname, ".."));
  return fromFile || STEAM_APP_ID;
}

export function initSteam(): Steam | null {
  const appId = resolveAppId();
  if (!appId) return null;
  let steamworks: SteamworksModule;
  try {
    steamworks = require("steamworks.js") as SteamworksModule;
  } catch (err) {
    console.error("steamworks.js failed to load:", err);
    return null;
  }
  try {
    if (app.isPackaged && steamworks.restartAppIfNecessary(appId)) {
      app.exit(0);
      return null;
    }
    const client = steamworks.init(appId);
    steamworks.electronEnableSteamOverlay();
    return { appId, client };
  } catch (err) {
    // Steam not running, or not signed in: still a game, just not on Steam
    console.warn("Steam unavailable:", err);
    return null;
  }
}

/** what the renderer may ask of Steam — see desktop/src/preload.ts */
export function installSteamHandlers(steam: Steam | null): void {
  ipcMain.on("steam:available", (event) => {
    event.returnValue = steam !== null;
  });
  ipcMain.on("steam:achievement", (_event, id: unknown) => {
    if (!steam || typeof id !== "string") return;
    try {
      steam.client.achievement.activate(id);
    } catch (err) {
      console.error("achievement failed:", err);
    }
  });
}
