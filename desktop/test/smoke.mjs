// Launches the compiled shell against ../out under Playwright's Electron
// driver and checks the things the shell exists for: the bundle is served
// on app://game/, the game gets a WebGL2 canvas, the bridge is on window,
// and a save round-trips through the file on disk. Run with `npm test`
// here, after `npm run build:static` at the repo root.
import { _electron as electron } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const out = path.resolve(root, "..", "out");
if (!process.env.SMOKE_EXECUTABLE && !process.env.SMOKE_DEV_URL && !fs.existsSync(path.join(out, "index.html"))) {
  console.error(`no bundle at ${out}: run \`npm run build:static\` at the repo root first`);
  process.exit(1);
}

// A DATA DIRECTORY OF OUR OWN, so the test never touches a real save.
// It is handed over as Chromium's --user-data-dir switch, which is the
// only way that holds on every platform: the env vars below do it on
// Linux, but Electron IGNORES APPDATA on Windows and resolves the real
// Roaming folder, so a test that set env alone would write into the
// player's own %APPDATA%\Animechs\saves and then clear it. main.ts
// leaves its own setPath alone when the switch is present.
const appData = fs.mkdtempSync(path.join(os.tmpdir(), "animechs-smoke-"));
const userData = path.join(appData, "Animechs");
// SMOKE_EXECUTABLE=release/linux-unpacked/animechs runs the same checks
// against a packed build instead of dist/ + ../out; SMOKE_DEV_URL=
// http://localhost:3000 runs them against a Next dev server through the
// shell's --dev-url mode (start the server first).
//
// --no-sandbox and software GL are for a CI box with no GPU and no user
// namespace; a real desktop needs neither
const packed = process.env.SMOKE_EXECUTABLE;
const devUrl = process.env.SMOKE_DEV_URL;
const origin = devUrl ? new URL(devUrl).origin : "app://game";
const app = await electron.launch({
  ...(packed ? { executablePath: path.resolve(packed) } : {}),
  args: [
    ...(packed ? [] : [root]),
    ...(devUrl ? [`--dev-url=${devUrl}`] : []),
    `--user-data-dir=${userData}`,
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
  env: { ...process.env, XDG_CONFIG_HOME: appData, APPDATA: appData },
});
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

try {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  check(`page is served on ${origin}/`, page.url().startsWith(`${origin}/`), page.url());
  await page.waitForSelector("canvas", { timeout: devUrl ? 120_000 : 30_000 });

  const probe = await page.evaluate(async () => {
    const res = await fetch("/levels/index.json");
    const b = typeof window.animechsDesktop;
    return {
      title: document.title,
      canvases: document.querySelectorAll("canvas").length,
      webgl2: !!document.createElement("canvas").getContext("webgl2"),
      levelsFetch: res.status,
      bridge: b,
      platform: window.animechsDesktop?.platform,
      steam: window.animechsDesktop?.steam.available,
    };
  });
  check("title", probe.title === "Animechs", probe.title);
  check("canvas mounted", probe.canvases > 0, `${probe.canvases} canvases`);
  check("WebGL2 context", probe.webgl2);
  check("absolute fetch resolves", probe.levelsFetch === 200, `status ${probe.levelsFetch}`);
  check("bridge on window", probe.bridge === "object", `platform=${probe.platform} steam=${probe.steam}`);

  // THE DISPLAY: the modes the Video tab offers, and the promise that
  // switching between them keeps the running game — the whole reason the
  // page is a view moved between windows rather than a window reloaded
  // (desktop/src/display.ts)
  const before = await page.evaluate(() => {
    window.__smokeAlive = true; // a reload would lose this
    return window.animechsDesktop.display?.get() ?? null;
  });
  check("display state on the bridge", !!before && Array.isArray(before.displays), JSON.stringify(before));
  check("opens windowed", before?.mode === "windowed", String(before?.mode));
  check("a monitor is listed", (before?.displays.length ?? 0) > 0 && before.displays.some((d) => d.id === before.displayId));

  // TWENTY SECONDS, AND IT IS NOT GENEROSITY. A mode change re-parents
  // the running game into a window of the other kind (display.ts
  // rebuild), which makes Chromium tear down and rebuild the compositor
  // surface — and the page on it is a WebGL2 canvas that has to restore
  // its context behind that. The main process notifies immediately; it is
  // the RENDERER that cannot get to the message until it is done, so how
  // long this takes scales with the monitor. Measured over twelve swaps
  // on a 2560x1440 screen: 1.7s to 5.1s, two of them past the 5s this
  // used to allow. That is what made the check fail on a second monitor
  // and pass on a small primary — a real transition timed out, not a
  // broken one. The window itself has already changed; only word of it
  // is late.
  const swap = async (mode) =>
    page.evaluate(
      (m) =>
        new Promise((resolve) => {
          const d = window.animechsDesktop.display;
          const off = d.onChange((s) => {
            if (s.mode !== m) return;
            off();
            resolve(s);
          });
          d.setMode(m);
          setTimeout(() => {
            off();
            resolve(null);
          }, 20000);
        }),
      mode,
    );

  const borderless = await swap("borderless");
  check("switches to borderless", borderless?.mode === "borderless", String(borderless?.mode));
  check("the game is not reloaded by it", (await page.evaluate(() => window.__smokeAlive)) === true);
  const full = await swap("fullscreen");
  check("switches to fullscreen", full?.mode === "fullscreen", String(full?.mode));
  // and back the other way: leaving fullscreen for a frameless window is
  // the move that has both a window swap and a fullscreen exit in it
  const again = await swap("borderless");
  check("fullscreen back to borderless", again?.mode === "borderless", String(again?.mode));
  const windowed = await swap("windowed");
  check("switches back to windowed", windowed?.mode === "windowed", String(windowed?.mode));
  check("still the same page", (await page.evaluate(() => window.__smokeAlive)) === true);

  const roundTrip = await page.evaluate(() => {
    const s = window.animechsDesktop.saves;
    s.write('{"smoke":1}');
    return new Promise((r) => setTimeout(() => r(s.read()), 300));
  });
  check("save round-trips through the file", roundTrip === '{"smoke":1}', String(roundTrip));
  const saved = fs.existsSync(path.join(userData, "saves", "progress.json"));
  check("save file is under Animechs/saves", saved);
  await page.evaluate(() => window.animechsDesktop.saves.clear());
  await new Promise((r) => setTimeout(r, 300));
  check("clear removes it", !fs.existsSync(path.join(userData, "saves", "progress.json")));

  const traversal = await page.evaluate(async () => (await fetch("/../package.json")).status);
  check("no path traversal", traversal === 404, `status ${traversal}`);

  const shot = path.join(here, "smoke.png");
  await page.screenshot({ path: shot });
  console.log(`screenshot: ${shot}`);
} finally {
  await app.close();
  fs.rmSync(appData, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
