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

/**
 * A WAY IN, FOR DEVELOPMENT ONLY. The game is played in this window, not
 * in a browser tab, which means the window is where a slow wave actually
 * happens — and until now the only way to ask it anything was to open
 * devtools by hand and type. This opens the same debugging channel
 * devtools itself uses, so a tool outside the shell can evaluate against
 * the live game (scripts/probe.mjs): arm the sim's phase clock, read it
 * back, pull the frame's numbers, without touching the run.
 *
 * NEVER IN A PACKAGED BUILD. `isPackaged` gates it exactly as it gates the
 * devtools menu item below, so what ships has no port on it. Chromium
 * binds this to the loopback interface only, so even in development it is
 * reachable from this machine and nowhere else.
 *
 * It must be set BEFORE the app is ready — a Chromium switch appended
 * after the browser process has started is a switch that does nothing.
 */
const DEBUG_PORT = "9222";
if (!app.isPackaged) app.commandLine.appendSwitch("remote-debugging-port", DEBUG_PORT);

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

// one data directory whatever the package is called: %APPDATA%/Animechs,
// ~/.config/Animechs, ~/Library/Application Support/Animechs
//
// UNLESS THE LAUNCH ASKED FOR SOMEWHERE ELSE. Chromium's own
// --user-data-dir switch is how the smoke test gets a throwaway
// directory, and it is the only way that works on every platform:
// Electron reads XDG_CONFIG_HOME on Linux but IGNORES the APPDATA
// environment variable on Windows, so a test that sets env alone is
// silently pointed at the player's real save. setPath would overrule the
// switch, so when it is present we leave the path Chromium already
// resolved from it well alone.
const OWN_DATA_DIR = process.argv.some((a) => a.startsWith("--user-data-dir="));
if (!OWN_DATA_DIR) {
  app.setPath("userData", path.join(app.getPath("appData"), "Animechs"));
}
const userData = app.getPath("userData");
// the game was called MechSwarm until the animal mechs: a shell that ran
// under the old name left its save and window state one directory over,
// so carry those files across the first time the new name boots. Skipped
// for a launch pointed at its own directory — that is a test or a second
// profile, and neither wants somebody else's campaign appearing in it
if (!OWN_DATA_DIR) adoptFormerDataDir(app.getPath("appData"), userData);

function adoptFormerDataDir(appData: string, target: string): void {
  const former = path.join(appData, "MechSwarm");
  // ONLY OUR OWN THREE FILES MOVE. The rest of a userData directory
  // belongs to Chromium — caches, cookies, GPU blobs, a lock file it
  // still holds open — and it is both large and rebuilt on first boot,
  // so copying the directory whole would drag a stale profile across and
  // could fail halfway through on a file that will not open.
  const mine = [path.join("saves", "progress.json"), path.join("saves", "progress.bak.json"), "window.json"];
  // the save is the test, not the directory: Electron makes an empty
  // userData of its own, and copying over a campaign already played
  // under the new name would be the one unrecoverable mistake here
  const save = (dir: string): string => path.join(dir, "saves", "progress.json");
  try {
    if (fs.existsSync(save(target)) || !fs.existsSync(save(former))) return;
    for (const rel of mine) {
      const from = path.join(former, rel);
      if (!fs.existsSync(from)) continue;
      const to = path.join(target, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      // COPIED, NEVER MOVED: the old directory stays exactly as it was,
      // so a player who reinstalls the previous build still has it
      fs.copyFileSync(from, to);
    }
  } catch {
    // a locked or unreadable old directory is not worth failing a boot
    // over — the player starts fresh instead of not starting at all
  }
}

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
    title: "Animechs",
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
      "Animechs",
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
