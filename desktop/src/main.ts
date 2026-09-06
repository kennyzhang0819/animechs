import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { APP_ORIGIN, registerAppScheme, serveBundle } from "./serve";
import { installSaveHandlers, savesDir } from "./saves";
import { initSteam, installSteamHandlers } from "./steam";
import { loadWindowState, saveWindowState } from "./window-state";

/**
 * THE DESKTOP SHELL. One window, the static export served on app://game/
 * (serve.ts), the save on disk (saves.ts), Steam when there is an app id
 * (steam.ts). Nothing in game/ or components/ is desktop-specific; the
 * game finds the shell through the bridge preload.ts puts on window.
 */

const BACKGROUND = "#0B0B0D"; // the game paints its own; no white flash at launch
const MIN_WIDTH = 960;
const MIN_HEIGHT = 600;

/** the export: beside the shell in development, in resources/ when packaged */
function bundleDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "game")
    : path.resolve(__dirname, "..", "..", "out");
}

/**
 * THE DEV SERVER, instead of the export: `--dev-url=http://localhost:3000`
 * points the window at Next's dev server (scripts/desktop-dev.mjs at the
 * repo root starts both), so the game is developed inside the shell it
 * ships in — hot reload, the admin editors and their API routes, and the
 * save on disk. Only honoured in an unpackaged shell.
 */
function devUrl(): string | null {
  if (app.isPackaged) return null;
  const arg = process.argv.find((a) => a.startsWith("--dev-url="));
  return arg ? arg.slice("--dev-url=".length) : null;
}
const DEV_URL = devUrl();
const ORIGIN = DEV_URL ? new URL(DEV_URL).origin : APP_ORIGIN;

// one data directory whatever the package is called: %APPDATA%/MechSwarm,
// ~/.config/MechSwarm, ~/Library/Application Support/MechSwarm
app.setPath("userData", path.join(app.getPath("appData"), "MechSwarm"));
const userData = app.getPath("userData");

registerAppScheme();
const steam = initSteam();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

function buildMenu(): void {
  const view: MenuItemConstructorOptions[] = [
    { role: "togglefullscreen", accelerator: process.platform === "darwin" ? "Ctrl+Cmd+F" : "F11" },
  ];
  if (!app.isPackaged) view.push({ role: "toggleDevTools" }, { role: "reload" });
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    { label: "View", submenu: view },
    ...(process.platform !== "darwin"
      ? [{ label: "Game", submenu: [{ role: "quit" as const }] }]
      : []),
  ];
  // Windows and Linux keep the bar hidden (autoHideMenuBar) — the
  // accelerators still work, and Alt shows it
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): BrowserWindow {
  const state = loadWindowState(userData);
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    fullscreen: state.fullscreen,
    backgroundColor: BACKGROUND,
    title: "MechSwarm",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.on("close", () => saveWindowState(userData, win));

  // the page is the game and nothing else: no navigating off its origin,
  // and a link that wants a browser gets the system one
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ORIGIN)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (DEV_URL) {
    // the dev server may still be compiling when the window opens: keep
    // knocking until it answers, instead of showing Chromium's error page
    const load = (): void => {
      win.loadURL(DEV_URL).catch(() => setTimeout(load, 1000));
    };
    load();
  } else {
    void win.loadURL(`${APP_ORIGIN}/`);
  }
  return win;
}

void app.whenReady().then(() => {
  const root = bundleDir();
  if (!DEV_URL && !fs.existsSync(path.join(root, "index.html"))) {
    dialog.showErrorBox(
      "MechSwarm",
      `No game bundle at ${root}.\n\nRun \`npm run build:static\` at the repository root first.`,
    );
    app.exit(1);
    return;
  }
  if (!DEV_URL) serveBundle(root);
  installSaveHandlers(savesDir(userData));
  installSteamHandlers(steam);
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// one window is the game; closing it is quitting, on every platform
app.on("window-all-closed", () => app.quit());
