# Desktop builds (Electron, for Steam)

The game ships to Steam as an Electron app: the same static bundle a web
host would serve, inside a bundled Chromium. Nothing in `game/` or
`components/` is desktop-specific; the shell lives in `desktop/` and the
game finds it through one bridge on `window` (see below).

## Build and run

```bash
npm run dev                # DEVELOP HERE: a production build, served inside the shell
npm run desktop            # static export into out/, then launch the shell
npm run desktop:pack       # + electron-builder → desktop/release/<os>-unpacked/
npm run desktop:pack:steam # Windows and Linux unpacked dirs, from any OS
npm run desktop:test       # the smoke test (needs out/ and a display; see below)
```

**`npm run dev` is the development loop, and it is a PRODUCTION BUILD.** The
game is a real-time simulation drawn at sixty frames a second, and Next's
dev mode — React reconciling in development, no minification, a file
watcher and a hot-reload socket on the same main thread — made the thing
being played feel nothing like the thing being shipped. So the loop runs
`next build` and then `next start`, with NEXT_PUBLIC_ADMIN=1 so the admin
editors and their API routes come along (game/env.ts ADMIN_ENABLED). A
code change is a rebuild — thirty-odd seconds, cached — rather than a hot
reload; `npm run dev:hot` is the old loop for when that trade is wrong.
It starts the server and the
shell together (scripts/desktop-dev.mjs) and points the window at the
server (`--dev-url`, honoured only by an unpackaged shell), so
the admin editors (Ctrl+Shift+M) and their file-writing API routes all
work, the save lands in the same file on disk the shipped game uses, and
closing the window ends both. The shell keeps retrying the URL until Next
has compiled, so the order they come up in does not matter. F12 opens
DevTools. A bare browser tab on `npm run dev:web` still works but falls back
to localStorage for its save, and nothing ships that way.

or the halves separately:

```bash
npm run build:static           # BUILD_TARGET=static export → out/
npm --prefix desktop run start # compile desktop/src → desktop/dist, run Electron
```

`desktop/` is its own npm package (`npm run dev` runs `npm ci`
there on first run; by hand, `cd desktop && npm install` once — Electron
fetches its binary in that package's postinstall) so that Electron,
electron-builder and steamworks.js stay out of the web build, and so that the packed app carries steamworks.js and nothing else
from `node_modules` — never Next or React, which are already compiled
into `out/`.

`build:static` (scripts/build-static.sh) temporarily sets `app/api`
aside: those routes are dev-only editor tools (they 403 in production
anyway) and their POST handlers are incompatible with Next's
`output: "export"`. The script always restores them, even on a failed
build. The desktop app therefore has no level/map editor persistence —
by design; the admin page is compiled out of a production bundle too.

## What the shell is

| file | does |
|---|---|
| `desktop/src/main.ts` | the app: the menu accelerators (F11 fullscreen, Ctrl+Cmd+F on macOS), single instance, no navigation off the game, the `--dev-url` mode |
| `desktop/src/display.ts` | **the window**, and the three ways it fills a screen — windowed, borderless, fullscreen — on the monitor of your choice. See below |
| `desktop/src/window-state.ts` | where the window was: the windowed size and place, the display mode, the monitor — `window.json` beside the save |
| `desktop/src/serve.ts` | serves `out/` on **`app://game/`**. The game fetches by absolute path — `/levels/…`, `/maps/…`, `/_next/static/…` — which `file://` cannot resolve, so the export gets a scheme with a root. `/admin` → `admin.html`, Next-style; nothing outside `out/` is ever served |
| `desktop/src/saves.ts` | the save file: `progress.json` under the data directory, written atomically with a `.bak` of the previous save |
| `desktop/src/steam.ts` | Steamworks, off until there is an app id |
| `desktop/src/preload.ts` | **the bridge**: `window.mechswarmDesktop` — `saves.read/write/clear`, `display.get/setMode/setMonitor/onChange`, `steam.available`, `steam.unlockAchievement`, `platform`. Sandboxed and context-isolated; the page never sees Node |
| `desktop/electron-builder.yml` | the pack: `dist/` in the asar, `out/` as `resources/game`, steamworks.js unpacked beside its redistributable |
| `desktop/test/smoke.mjs` | the smoke test |

`game/storage.ts` is the game's side of the bridge: one save slot, read
once at boot, and localStorage when there is no bridge (the web build).
`game/progress.ts` is its only caller — and `displayControls()`, which is
what the Video tab of Settings draws its window rows from — and what drops
them in a browser tab, where there is no window of ours to set.

## Display modes and monitors

The **Video tab** of Settings (menu and pause overlay both) offers three
modes and the list of monitors the system reports, alongside the
ambient-effects switch, which is the game's own and is there in a browser
too:

| mode | what it is |
|---|---|
| windowed | a framed window at the remembered size. Drag it to another monitor and that monitor becomes the choice |
| borderless | a frameless window covering the whole monitor: it looks like fullscreen but stays a window, so alt-tab is instant and the cursor leaves for another screen freely |
| fullscreen | the platform's own — a Space on macOS, the window manager's fullscreen on Windows and Linux. Chromium has no exclusive/mode-setting fullscreen to offer, so no resolution is ever changed |

**The game is a `WebContentsView` inside a `BaseWindow`, not a
`BrowserWindow`.** Electron fixes a window's frame at construction — there
is no `setFrame` — so borderless has to be a different window from the
framed one. A view can be moved from one window to another with the page
still running, which is what `Shell.rebuild` does: the mode changes and
**the run survives**, where reloading the page into a new window would
throw it away. The smoke test checks exactly that.

The mode, the monitor and the windowed size are the shell's state, not the
save's — the shell has to know them before the game boots — so they live in
`window.json` and never go to Steam Cloud: which screen a machine has is a
fact about that machine. A monitor that is no longer plugged in is dropped
and the game opens on the primary; unplugging one mid-session pulls the
window back onto a screen that exists.

F11 (Ctrl+Cmd+F on macOS) toggles fullscreen and **comes back to the mode
it left** — borderless stays borderless. The platform's own fullscreen —
macOS's green button, a window manager's shortcut — is followed the same
way, so the tab never claims something the window is not doing.

Nothing here makes the window unresizable, tempting as that is for a
borderless window with no edges to grab: on Windows a window that is not
resizable is pinned to the size it has, and `setBounds` onto a monitor of
another size — which is what changing monitor is — then does nothing at
all. That was the whole of why the monitor picker did not move the game.

## Where the data lives

The data directory is `MechSwarm` under the OS's application-data root,
whatever the package is called:

| OS | saves |
|---|---|
| Windows | `%APPDATA%\MechSwarm\saves\progress.json` |
| macOS | `~/Library/Application Support/MechSwarm/saves/progress.json` |
| Linux, Steam Deck | `~/.config/MechSwarm/saves/progress.json` |

**Steam Cloud needs no code.** On the partner site, set Auto-Cloud roots
on those three paths (`WinAppDataRoaming`, `MacAppSupport`, `LinuxHome`
+ `.config`, each with subdirectory `MechSwarm/saves`) and Steam syncs
the file. `window.json` beside it — the window's size, its display mode
and its monitor — is deliberately not synced.

## Steam

The shell runs as a plain desktop game until it knows its app id — which
is what `npm run desktop` does on a machine without Steam. It looks, in
order, at the `SteamAppId` variable Steam sets on everything it
launches, at a `steam_appid.txt` beside the executable (or in `desktop/`
during development — gitignored), and at `STEAM_APP_ID` in
`desktop/src/steam.ts`, which is 0 until Valve assigns one.

With an id:

- a **packaged** build launched from outside Steam hands off to Steam and
  quits (`restartAppIfNecessary`), which is the normal thing for a Steam
  build; a `steam_appid.txt` beside it disables that for testing
- the Steamworks client is initialised (`steamworks.js`, prebuilt for
  win64, linux64, macOS x64 and arm64) and the **overlay** is enabled. The
  overlay needs Chromium's GPU work in-process to hook it, so
  steamworks.js adds `--in-process-gpu` and `--disable-direct-composition`
  before the app is ready — measure the frame time with and without an
  app id if the Windows build ever feels slower than the web build
- `steam.unlockAchievement(id)` on the bridge activates an achievement by
  API name. **No achievements are designed yet**: this is the hook, not
  the list

To test against Steam before the game has its own id, put `480` (Valve's
Spacewar test app) in `desktop/steam_appid.txt` and run with the Steam
client signed in.

## Uploading to Steam

`npm run desktop:pack:steam` leaves `desktop/release/win-unpacked/` and
`desktop/release/linux-unpacked/` — one depot each, uploaded as they are
with SteamPipe (`steamcmd` + a depot build script pointing at the
directory). Installers are deliberately not built: Steam is the
installer. Launch options on the partner site: `MechSwarm.exe` for
Windows, `mechswarm` for Linux.

**Steam Deck** runs the Linux depot natively — no Proton. Chromium's
WebGL2 is fine on its GPU. What Deck *verification* also wants is not in
the shell: controller navigation of the menus and HUD (the game is
pointer-driven; the trackpad works, Steam Input can map a pad to it in
the meantime) and text readable at 1280×800.

macOS is packable only on macOS (electron-builder cannot cross-build it)
and needs signing and notarization before Gatekeeper lets it run; the
`libsteam_api.dylib` also has to be copied into the bundle. Not set up.

## The smoke test

```bash
npm run build:static
cd desktop && npm test                      # against dist/ + ../out
SMOKE_EXECUTABLE=release/linux-unpacked/mechswarm npm test   # against a packed build
SMOKE_DEV_URL=http://localhost:3000 npm test                  # through --dev-url, server running
```

It launches the shell under Playwright's Electron driver and checks that
the page is served on `app://game/`, the game gets a WebGL2 canvas, an
absolute fetch resolves, the bridge is on `window`, the display modes all
switch **without reloading the running game**, a save round-trips through
the file on disk and `clear` removes it, and `/../` cannot escape `out/`. It leaves `desktop/test/smoke.png` behind. On a headless box run
it under `xvfb-run`; the test passes `--no-sandbox` and software-GL flags
that a real desktop does not need.

## What is deliberately NOT done yet

- **No app id.** `STEAM_APP_ID` is 0; Steam is off until it is set.
- **No achievements, no stats, no rich presence.** The bridge has the one
  call; what to unlock and when is design work.
- **No controller support.** See Steam Deck above.
- **No icons.** Electron's default ships; electron-builder takes a `build/icon.png` (Linux), `.ico` and `.icns` when there is art.
- **No macOS pipeline.** See above.
- **No auto-update.** Steam does that.
