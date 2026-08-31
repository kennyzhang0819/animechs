# Mobile builds (Capacitor)

The game ships to iOS and Android as a Capacitor app: the same static
bundle the web serves, inside a native WebView shell (WKWebView on iOS,
Chromium WebView on Android). Nothing in `game/` or `components/` is
mobile-specific; the shell lives in `ios/`, `android/`, and
`capacitor.config.ts`.

## Build

```bash
npm run mobile        # static export into out/ + cap sync into both shells
```

or the two halves separately:

```bash
npm run build:mobile  # BUILD_TARGET=mobile static export → out/
npm run cap:sync      # copy out/ into ios/ and android/
```

`build:mobile` (scripts/build-mobile.sh) temporarily sets `app/api`
aside: those routes are dev-only editor tools (they 403 in production
anyway) and their POST handlers are incompatible with Next's
`output: "export"`. The script always restores them, even on a failed
build. The mobile app therefore has no level/map editor persistence —
by design.

Capacitor serves `out/` at the root of its local scheme, so the game's
absolute fetches (`/levels/1.json`, `/maps/…`) work unchanged.

## Run on an iPhone (no paid Apple account needed)

Requires a Mac with Xcode. A free Apple ID is enough for on-device
testing ("personal team" signing): the install expires after 7 days
(re-run from Xcode to refresh) and real IAP is unavailable, but Xcode's
local StoreKit testing works.

```bash
npx cap open ios
```

Then in Xcode: Signing & Capabilities → pick your personal team → give
the app a unique bundle id if the default collides → plug in the phone →
Run. First launch: on the phone, Settings → General → VPN & Device
Management → trust the developer certificate.

Tip: for pure performance measurement you don't need the shell at all —
Capacitor on iOS *is* Safari's engine, so the deployed web game opened
in iPhone Safari benchmarks within noise of the wrapped app, and
Mac Safari → Develop → (your iPhone) profiles it over a cable.

## Run on Android

Requires Android Studio (for the SDK). No account of any kind: enable
Developer Options + USB debugging on the phone, then

```bash
npx cap run android    # or: npx cap open android and run from Studio
```

## What is deliberately NOT done yet

- **Saves still live in localStorage** (`game/progress.ts`). WebView
  localStorage persists across launches but is second-class on mobile
  (iOS can evict it under storage pressure). Before shipping, swap the
  storage backend in progress.ts for @capacitor/preferences or
  @capacitor/filesystem — every reader already goes through that one
  module.
- **No IAP plugin.** When monetization lands, add
  @revenuecat/purchases-capacitor (or capacitor-subscriptions) — no
  code elsewhere needs to change.
- **No icons/splash.** Defaults ship; generate real ones with
  `npx @capacitor/assets generate` when there's art.
