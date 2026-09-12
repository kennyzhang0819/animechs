import {
  app,
  BaseWindow,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import { APP_ORIGIN, registerAppScheme, serveBundle } from "./serve";
import { installSaveHandlers, savesDir } from "./saves";
import { installDisplayHandlers, Shell } from "./display";
import { initSteam, installSteamHandlers } from "./steam";
import { loadWindowState, saveWindowState } from "./window-state";

/**
 * THE DESKTOP SHELL. One window, the static export served on app://game/
 * (serve.ts), the save on disk (saves.ts), Steam when there is an app id
 * (steam.ts). The window itself — its size, which of the three display
 * modes it is in and which monitor it is on — is display.ts. Nothing in
 * game/ or components/ is desktop-specific; the game finds the shell
 * through the bridge preload.ts puts on window.
 */

const BACKGROUND = "#0B0B0D"; // the game paints its own; no white flash at launch
const MIN_WIDTH = 960;
const MIN_HEIGHT = 600;
/** show the window even if the page never finishes loading, rather than nothing at all */
const SHOW_ANYWAY_MS = 10_000;

/** the export: beside the shell in development, in resources/ when packaged */
function bundleDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "game")
    : path.resolve(__dirname, "..", "..", "out");
}

/**
 * A SERVER, instead of the export: `--dev-url=http://localhost:3000`
 * points the window at a running Next server (scripts/desktop-dev.mjs at
 * the repo root builds and starts one — a production build, with the
 * admin tools compiled in), so the game is developed inside the shell it
 * ships in: the admin editors and their API routes, and the save on
 * disk. Only honoured in an unpackaged shell.
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

/** the one shell there is, from launch to quit */
let game: Shell | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => game?.focus());
}

/**
 * THE GAME'S OWN EXIT. The menu's Exit button asks its question inside the
 * game (ConfirmDialog) and then says this — so the shell never puts up an
 * OS confirmation of its own, and quitting is one press and one answer
 * rather than a system sheet over a fullscreen window.
 */
function installQuitHandler(): void {
  ipcMain.on("app:quit", () => app.quit());
}

function buildMenu(): void {
  const view: MenuItemConstructorOptions[] = [
    {
      // not the `togglefullscreen` role: fullscreen is one of the three
      // display modes now (display.ts), and the key has to move the
      // setting the Video tab shows, not just the window
      label: "Toggle Full Screen",
      accelerator: process.platform === "darwin" ? "Ctrl+Cmd+F" : "F11",
      click: () => game?.toggleFullScreen(),
    },
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

function createShell(): Shell {
  const win = new Shell({
    preload: path.join(__dirname, "preload.js"),
    background: BACKGROUND,
    title: "MechSwarm",
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    state: loadWindowState(userData),
    onClose: (state) => saveWindowState(userData, state),
  });

  // the page is the game and nothing else: no navigating off its origin,
  // and a link that wants a browser gets the system one
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ORIGIN)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  // nothing is shown until the game has painted something — and shown
  // regardless after SHOW_ANYWAY_MS, so a page that never loads is still
  // a window the player can close
  win.webContents.once("did-finish-load", () => win.show());
  setTimeout(() => win.show(), SHOW_ANYWAY_MS);

  if (DEV_URL) {
    // the dev server may still be compiling when the window opens: keep
    // knocking until it answers, instead of showing Chromium's error page
    const load = (): void => {
      win.webContents.loadURL(DEV_URL).catch(() => setTimeout(load, 1000));
    };
    load();
  } else {
    void win.webContents.loadURL(`${APP_ORIGIN}/`);
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
  installQuitHandler();
  buildMenu();
  installDisplayHandlers(() => game);
  game = createShell();

  app.on("activate", () => {
    if (BaseWindow.getAllWindows().length === 0) game = createShell();
  });
});

// one window is the game; closing it is quitting, on every platform
app.on("window-all-closed", () => app.quit());
