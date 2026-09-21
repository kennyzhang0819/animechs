# Offline on a tablet — the installable build

The static export (`npm run build:static`, `docs/desktop.md` for the shell that wraps the
same bundle) is also an installable web app. Added to an iPad's home screen it launches with
no network at all: the whole bundle is precached the first time it is opened, and every
request afterwards is served from that cache.

## The three pieces

| | |
|---|---|
| `public/manifest.webmanifest` | name, standalone display, landscape, the icons |
| `scripts/gen-icons.mjs` | the home-screen mark, DRAWN not stored — the same rule as the rest of the art (`docs/unit-art.md`). A PWA icon has to be a real PNG on disk, so the script is the source and `public/icon-*.png` are the artifact |
| `scripts/gen-sw.mjs` | writes `out/sw.js`, registered by `components/OfflineReady.tsx` |

**The worker is generated after the export, never before.** Its precache list *is* the file
list of `out/`, and half those names carry a build hash, so it can only be written against a
bundle that already exists. `build-static.sh` runs it as the last step. The cache name is a
digest of that file list, so a rebuild can never be served out of the old cache.

## Why the whole bundle is precached

About 64 MB, 356 files, most of it the twelve map documents at ~2 MB each. Caching on demand
would be smaller and would not work: the point of this build is a run that starts somewhere
with no network, and the sprite that run needs is exactly the one that was never asked for at
home. Everything is taken at install, in batches of forty, each request tolerated
individually so one 404 cannot fail the install.

## The worker also puts the sim back on its own thread

Shared memory needs a cross-origin isolated page (`game/shared.ts`), which needs COOP and
COEP on the document. `next.config.ts` sets them for the dev server and the Electron shell
sets its own, but a static host sends neither — so without help the tablet quietly takes the
single-threaded fallback (`game/workerhost.ts`), on the machine that can least afford it.

The worker adds `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy` and
`Cross-Origin-Resource-Policy` to everything it serves. That is safe here only because
nothing in the bundle is cross-origin — the Google fonts are self-hosted into
`_next/static/media` by `next/font`, and every sprite, map and level document is same-origin.
**Embedding anything external would need a CORP header of its own rather than this being
dropped.**

A document's headers are fixed before any worker controls the page, so the first load is
never isolated. `OfflineReady` reloads once, guarded by a session flag so a page that still
is not isolated cannot loop.

## Pushing a build to the tablet

```bash
npm run ipad         # export, serve out/, point the tailnet name at it, print the URL
npm run ipad:watch   # the same, and re-export on every source edit
npm run ipad:serve    # serve out/ as it stands, no export
```

`scripts/push-ipad.mjs` does the three things by hand in one go: `build:static`, a static
host on `127.0.0.1:3120`, and `tailscale serve --bg --https=443` aimed at that port, so the
tablet reaches it at the machine's `*.ts.net` name over real HTTPS. Only the `/` mount is
touched; anything else the tailnet is serving is left alone. There is no Funnel anywhere in
this — the bundle is visible to the tailnet and nothing wider.

It serves the bundle itself rather than `npx serve` for two reasons. It sends COOP/COEP on
every response, so the **first** load is already cross-origin isolated and `OfflineReady`'s
reload never fires; and it starts without a network, which `npx serve` does not.
`sw.js` and every `.html` go out `no-store`, because a tablet holding the old bundle must
not be handed a cached copy of the file that would tell it about the new one.

**The tablet takes an update on its next launch, not while it is open.** The new `sw.js`
differs (its cache name is a digest of the file list), so the worker installs, `skipWaiting`s
and deletes the old cache — but the page already running was drawn from the old one. Close
the app on the iPad and reopen it.

`--watch` covers `game/`, `components/`, `app/`, `public/`, `docs/turret-concepts/` and
`next.config.ts`, minus the paths the build itself writes (`public/foundry/`,
`public/icon-*.png`) — watching those would rebuild forever.

## THE ORIGIN HAS TO BE SECURE, and a LAN address is not

**This is the one that bites.** A service worker is secure-context only, and only two things
count as secure: **HTTPS**, and a **loopback** address. `http://localhost:3120` and
`http://127.0.0.1:3120` are loopback and work. `http://192.168.1.8:3120` — the obvious way to
reach a laptop from a tablet on the same wi-fi — is **not** loopback and **not** secure, so
`navigator.serviceWorker` is not even defined there. The page loads and plays perfectly,
caches nothing at all, and is found out on a train.

It has already happened once, to a tablet, exactly that way. Testing on localhost cannot
catch it, because localhost has the property the tablet's URL lacks. So:

- **Serve the tablet over HTTPS.** A Tailscale `*.ts.net` name with HTTPS certificates
  enabled gets a real Let's Encrypt certificate, which is the least fiddly route — no
  certificate profile to install and trust on the device.
- **Or serve from the tablet itself**, where `http://localhost:<port>` is loopback and
  therefore secure by the spec.
- A self-signed certificate works too, but only once the device has installed the profile
  AND switched on full trust, which is two separate screens in iOS Settings.

`OfflineReady` states the failure in red rather than returning quietly, which is the actual
lesson: the offline path must never fail silently, because its whole promise is only tested
somewhere you cannot fix it.

## Storage is durable, but only from the home screen

WebKit deletes all script-writable storage — service worker caches and the `localStorage` the
save lives in (`game/progress.ts`) — after seven days of Safari use without interaction with
the site. Web apps added to the home screen are explicitly exempt: they are not part of
Safari and keep their own counter of days of use. **So a tab bookmarked in Safari will lose
the bundle and the save; the home-screen icon will not.** That exemption is the whole reason
this ships as an installable app rather than a cached page.

## What it does not fix: the controls

The game is bound to a keyboard and a pointer — `1/2/3/4`, `X`, `T`, `R`, `WASD`, space,
Delete, right-click to demolish, and **zoom is wheel-only** (`Game.onWheel`; there is no key
for it). Only `pointerdown` is bound, so a bare touch screen can tap and nothing else. A
tablet needs a hardware keyboard and a trackpad or mouse to play this. Touch controls would
be a separate piece of work.
