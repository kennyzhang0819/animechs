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
if (!process.env.SMOKE_EXECUTABLE && !fs.existsSync(path.join(out, "index.html"))) {
  console.error(`no bundle at ${out}: run \`npm run build:static\` at the repo root first`);
  process.exit(1);
}

// an appData of our own, so the test never touches a real save
const appData = fs.mkdtempSync(path.join(os.tmpdir(), "mechswarm-smoke-"));
// SMOKE_EXECUTABLE=release/linux-unpacked/mechswarm runs the same checks
// against a packed build instead of dist/ + ../out.
//
// --no-sandbox and software GL are for a CI box with no GPU and no user
// namespace; a real desktop needs neither
const packed = process.env.SMOKE_EXECUTABLE;
const app = await electron.launch({
  ...(packed ? { executablePath: path.resolve(packed) } : {}),
  args: [
    ...(packed ? [] : [root]),
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
  check("page is served on app://game/", page.url().startsWith("app://game/"), page.url());
  await page.waitForSelector("canvas", { timeout: 30_000 });

  const probe = await page.evaluate(async () => {
    const res = await fetch("/levels/index.json");
    const b = typeof window.mechswarmDesktop;
    return {
      title: document.title,
      canvases: document.querySelectorAll("canvas").length,
      webgl2: !!document.createElement("canvas").getContext("webgl2"),
      levelsFetch: res.status,
      bridge: b,
      platform: window.mechswarmDesktop?.platform,
      steam: window.mechswarmDesktop?.steam.available,
    };
  });
  check("title", probe.title === "MechSwarm", probe.title);
  check("canvas mounted", probe.canvases > 0, `${probe.canvases} canvases`);
  check("WebGL2 context", probe.webgl2);
  check("absolute fetch resolves", probe.levelsFetch === 200, `status ${probe.levelsFetch}`);
  check("bridge on window", probe.bridge === "object", `platform=${probe.platform} steam=${probe.steam}`);

  const roundTrip = await page.evaluate(() => {
    const s = window.mechswarmDesktop.saves;
    s.write('{"smoke":1}');
    return new Promise((r) => setTimeout(() => r(s.read()), 300));
  });
  check("save round-trips through the file", roundTrip === '{"smoke":1}', String(roundTrip));
  const saved = fs.existsSync(path.join(appData, "MechSwarm", "saves", "progress.json"));
  check("save file is under MechSwarm/saves", saved);
  await page.evaluate(() => window.mechswarmDesktop.saves.clear());
  await new Promise((r) => setTimeout(r, 300));
  check("clear removes it", !fs.existsSync(path.join(appData, "MechSwarm", "saves", "progress.json")));

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
