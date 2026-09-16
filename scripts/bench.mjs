#!/usr/bin/env node
/**
 * THE RENDER BENCH: the perf suite's other half — the one the headless
 * check cannot be (scripts/check.mjs has no GPU, no canvas, no renderer).
 *
 *   npm run bench                                  every scene, at a ladder of zooms
 *   npm run bench -- --scenes turrets,battle       just those
 *   npm run bench -- --zooms 3 --frames 60         a quicker ladder
 *   npm run bench -- --n 2000                      a smaller board, for iterating
 *   npm run bench -- --headed                      watch it
 *   npm run bench -- --json                        the table on stderr, one JSON
 *                                                  line on stdout (check.mjs reads it)
 *
 * WHAT IT MEASURES is the draw — Renderer.render, the HUD overlay, the
 * corner minimap and the handover from the sim (Game.frame's drawMs), per
 * frame, raw — on the shipping path: a real Game, the sim on its worker,
 * the frame paced by the browser's own rAF. Chromium runs headless on the
 * machine's GPU when it has one, and on SwiftShader (the software GPU,
 * the same switches desktop/test/smoke.mjs uses) when it does not or
 * `--software` says so. A software frame is SECONDS long — it is drawing
 * the whole terrain batch on the CPU — which makes the FRAME useless and
 * the DRAW still honest: drawMs is the main thread's JavaScript and never
 * the GPU's time, so it reads the same on a box with no GPU as on a
 * laptop. On a software GPU the sample is cut (SOFT_FRAMES) so the run
 * fits, the frame column is printed for information only, and `software`
 * rides the JSON so the reader knows.
 *
 * THE SCENES (scripts/bench/bench.js) are the standard the game is held
 * to — ten thousand of everything, at every zoom:
 *
 *   turrets   N turrets of every fielded kind and nothing to shoot
 *   enemies   N bodies of every tier, every one in reach of an immortal core
 *   battle    most of a board and the whole swarm, every gun on both sides
 *             in reach of something, the turrets dying and the swarm not
 *   upgrades  the same war under a hundred random upgrade nodes and a run's
 *             worth of modules
 *   waves     the script's own late waves on a built board, ranges as
 *             shipped — what a player is actually looking at
 *
 * ...each read at ZOOMS zooms from the floor (the whole map on screen) to
 * the ceiling, camera on the core. The verdict per cell is the MEDIAN draw
 * over FRAMES frames against DRAW_GOAL_MS; the p95 is printed beside it.
 *
 * HOW THE PAGE IS SERVED. The game modules are transpiled with tsc to ES
 * modules under .playtest/bench (only when a source is newer than the last
 * transpile, as the check does) and served from a server of this script's
 * own: extensionless imports resolve to the .js beside them, the worker
 * URLs (`new URL("./sim.worker.ts", import.meta.url)`) resolve to their
 * transpiles, public/ is the site's own public/, and every response carries
 * the two cross-origin-isolation headers next.config.ts sets — without
 * them there is no SharedArrayBuffer and the sim would fall back to this
 * thread, which is not the path that ships.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, ".playtest", "bench");

// ---------- args ----------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const JSON_OUT = flag("--json");
const HEADED = flag("--headed");
/** --verbose: every console line the page prints, not only its errors */
const VERBOSE = flag("--verbose");
const SCENES = opt("--scenes", "").split(",").filter(Boolean);
const ZOOMS = Number(opt("--zooms", 5));
const FRAMES = Number(opt("--frames", 120));
const WARM = Number(opt("--warm", 30));
const N = Number(opt("--n", 10000));
const UPGRADES = Number(opt("--upgrades", 100));
const WORLD = opt("--world", "");
/** --software: SwiftShader from the start, rather than the GPU first */
const SOFTWARE = flag("--software");
/** --viewport WxH: the canvas, in CSS px at a device pixel ratio of 1 */
const [VW, VH] = opt("--viewport", "1920x1080").split("x").map(Number);
/** a frame slower than this is a software GPU's, and the sample is cut to
 *  fit (SOFT_FRAMES, SOFT_WARM): the draw is the draw either way */
const SOFT_GAP_MS = 100;
const SOFT_FRAMES = 24;
const SOFT_WARM = 6;

/**
 * THE DRAW'S BUDGET, in ms a frame, median over the window. A frame is
 * 16.7ms and the browser takes three to five of it before the game gets
 * any (rAF dispatch, the HUD's React, compositing two canvases), so eight
 * is what leaves a sim step on the worker its own room and a spike
 * somewhere to go. It is the number the render half of `check:full` is
 * gated on, and it is meant to hold at EVERY zoom — a frame spent looking
 * at the whole board is still a frame.
 */
export const DRAW_GOAL_MS = 8;

const say = (s) => (JSON_OUT ? process.stderr : process.stdout).write(s + "\n");

// ---------- the transpile ----------

const run = (cmd, args) =>
  new Promise((done) => {
    const p = spawn(cmd, args, { cwd: ROOT, shell: process.platform === "win32" });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => done({ code, out, err }));
    p.on("error", (e) => done({ code: 1, out, err: String(e) }));
  });
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const newestSource = () => {
  let newest = 0;
  for (const e of fs.readdirSync(path.join(ROOT, "game"), { withFileTypes: true }))
    if (e.name.endsWith(".ts")) newest = Math.max(newest, fs.statSync(path.join(ROOT, "game", e.name)).mtimeMs);
  return newest;
};

// the heads and the core are authored in docs/turret-concepts/ and served
// from public/foundry/ — the atlas packs from there
spawnSync(process.execPath, [path.join(ROOT, "scripts", "sync-foundry-art.mjs")], { cwd: ROOT, stdio: "ignore" });

const built = path.join(DIST, "game", "game.js");
if (!fs.existsSync(built) || newestSource() > fs.statSync(built).mtimeMs) {
  fs.mkdirSync(DIST, { recursive: true });
  const t0 = Date.now();
  const r = await run(npx, [
    "tsc",
    // the page's imports, and the three workers nothing imports (they are
    // spawned by URL, which tsc does not follow)
    "game/game.ts", "game/sim.worker.ts", "game/field.worker.ts", "game/phys.worker.ts",
    "game/ladder.ts", "game/track.ts", "game/upgrades.ts", "game/mods.ts", "game/relics.ts",
    "game/maps.ts", "game/levels.ts", "game/types.ts", "game/constants.ts",
    "--outDir", DIST, "--rootDir", ROOT,
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler",
    "--lib", "dom,dom.iterable,esnext", "--skipLibCheck", "--esModuleInterop",
    "--resolveJsonModule", "--noEmitOnError", "false",
  ]);
  if (!fs.existsSync(built)) {
    console.error((r.out + r.err).trim() || "tsc emitted no game.js");
    process.exit(2);
  }
  say(`transpiled game/ to .playtest/bench in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ---------- the server ----------

const MIME = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".wasm": "application/wasm", ".woff": "font/woff", ".woff2": "font/woff2",
  ".txt": "text/plain",
};
const PUBLIC = path.join(ROOT, "public");
const resolveFile = (url) => {
  const p = decodeURIComponent(url.split("?")[0]);
  if (p === "/" || p === "/index.html") return path.join(HERE, "bench", "index.html");
  if (p === "/bench.js") return path.join(HERE, "bench", "bench.js");
  if (p.startsWith("/game/")) {
    let f = p.slice(1);
    if (f.endsWith(".ts")) f = `${f.slice(0, -3)}.js`;
    else if (!path.extname(f)) f = `${f}.js`;
    return path.join(DIST, f);
  }
  return path.join(PUBLIC, p);
};
const server = http.createServer((req, res) => {
  const file = path.normalize(resolveFile(req.url ?? "/"));
  const inside = [DIST, PUBLIC, path.join(HERE, "bench")].some((d) => file.startsWith(d + path.sep) || file === d);
  const ok = inside && fs.existsSync(file) && fs.statSync(file).isFile();
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cache-Control", "no-store");
  if (!ok) {
    if (VERBOSE) say(`  404 ${req.url}`);
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  res.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
  // game/env.ts reads process.env at import, in the page AND in the sim's
  // worker — Next inlines it at build time; a bare module has no process.
  // An empty env, module-local: NODE_ENV is not "production", so the game
  // counts this as a dev build, which is what a bench is
  if (file === path.join(DIST, "game", "env.js")) {
    res.end(`const process = globalThis.process ?? { env: {} };\n${fs.readFileSync(file, "utf8")}`);
    return;
  }
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(Number(opt("--port", 0)), "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

// ---------- the browser ----------

/**
 * WHICH CHROMIUM. Playwright's own, when the installed package has its
 * browser (`npx playwright install chromium`); otherwise whatever a box
 * points at — BENCH_CHROMIUM, or a chromium under PLAYWRIGHT_BROWSERS_PATH
 * from another Playwright version, which drives fine across a few minors.
 */
const findChromium = () => {
  try { if (fs.existsSync(chromium.executablePath())) return undefined; } catch {}
  if (process.env.BENCH_CHROMIUM && fs.existsSync(process.env.BENCH_CHROMIUM)) return process.env.BENCH_CHROMIUM;
  const home = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (home && fs.existsSync(home)) {
    const link = path.join(home, "chromium");
    if (fs.existsSync(link)) return link;
    for (const d of fs.readdirSync(home).filter((n) => n.startsWith("chromium-")).sort().reverse())
      for (const exe of ["chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-win/chrome.exe"]) {
        const f = path.join(home, d, exe);
        if (fs.existsSync(f)) return f;
      }
  }
  return undefined;
};

/** a browser, on the GPU or on SwiftShader; null when there is none to launch */
const launch = async (software) => {
  try {
    return await chromium.launch({
      headless: !HEADED,
      executablePath: findChromium(),
      // --no-sandbox for a box with no user namespace; the rest is the
      // software GPU (desktop/test/smoke.mjs), or the hardware one unblocked
      args: [
        "--no-sandbox", "--ignore-gpu-blocklist",
        ...(software ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--enable-gpu-rasterization"]),
      ],
    });
  } catch (e) {
    console.error(`no Chromium to run the bench in: ${e.message}\nrun \`npx playwright install chromium\`, or point BENCH_CHROMIUM at one`);
    return null;
  }
};
/** does this browser give the page WebGL2? — the GPU path may not, headless */
const hasWebgl2 = async (b) => {
  const page = await b.newPage();
  try {
    return await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  } finally {
    await page.close();
  }
};
let software = SOFTWARE;
let browser = await launch(software);
if (browser && !software && !(await hasWebgl2(browser))) {
  await browser.close();
  say("no WebGL2 on the GPU path; falling back to SwiftShader");
  software = true;
  browser = await launch(true);
}
if (!browser) {
  server.close();
  process.exit(2);
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const p95 = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * 0.95)] : NaN; };
const rows = [];
let failed = false;

try {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15 * 60 * 1000);
  page.on("pageerror", (e) => say(`  page error: ${e.message}`));
  page.on("console", (m) => {
    if (VERBOSE || m.type() === "error" || m.type() === "warning") say(`  console.${m.type()}: ${m.text()}`);
  });
  const params = new URLSearchParams({ n: String(N), upgrades: String(UPGRADES) });
  if (WORLD) params.set("world", WORLD);
  await page.goto(`${origin}/?${params}`);
  await page.waitForFunction(() => window.__bench?.ready === true);
  const scenes = SCENES.length ? SCENES : await page.evaluate(() => window.__bench.scenes);
  // HOW LONG IS A FRAME HERE? Read off the empty page before any board is
  // up: a software GPU takes seconds to draw the terrain alone, and a
  // sample sized for sixty a second would run for hours. The draw is the
  // draw at any frame length; only the number of frames is cut
  let frames = FRAMES, warm = WARM;
  const probe = await page.evaluate(() => window.__bench.probe(4));
  const gap = median(probe.gap);
  if (gap > SOFT_GAP_MS) {
    software = true;
    frames = Math.min(frames, SOFT_FRAMES);
    warm = Math.min(warm, SOFT_WARM);
    say(`a frame here is ${(gap / 1000).toFixed(1)}s (software GPU): ${frames} frames a cell after ${warm} warm, not ${FRAMES} after ${WARM}`);
  }

  say(`${"scene".padEnd(9)} ${"zoom".padStart(6)}  ${"draw med/p95".padStart(14)}  ${"frame".padStart(7)}  ${"bodies".padStart(6)} ${"turrets".padStart(7)} ${"shots".padStart(6)} ${"fx".padStart(5)}`);
  for (const scene of scenes) {
    const t0 = Date.now();
    const built = await page.evaluate((s) => window.__bench.scene(s), scene);
    const { min, max } = await page.evaluate(() => window.__bench.zoomRange());
    const ladder = Array.from({ length: Math.max(2, ZOOMS) }, (_, i) => min * (max / min) ** (i / (Math.max(2, ZOOMS) - 1)));
    for (const z of ladder) {
      const s = await page.evaluate(({ z, f, w }) => window.__bench.measure(z, f, w), { z, f: frames, w: warm });
      const row = {
        scene, zoom: s.zoom, drawMed: median(s.draw), drawP95: p95(s.draw), gapMed: median(s.gap), simMed: median(s.sim),
        bodies: s.bodies, towers: s.towers, shots: s.shots, fx: s.fx, simStep: s.simStep,
      };
      row.ok = row.drawMed <= DRAW_GOAL_MS;
      if (!row.ok) failed = true;
      rows.push(row);
      say(
        `${(row.ok ? "" : "! ") + scene}`.padEnd(9) +
          ` ${row.zoom.toFixed(2).padStart(6)}  ${`${row.drawMed.toFixed(1)} / ${row.drawP95.toFixed(1)}`.padStart(14)}  ` +
          `${row.gapMed.toFixed(1).padStart(7)}  ${String(row.bodies).padStart(6)} ${String(row.towers).padStart(7)} ` +
          `${String(row.shots).padStart(6)} ${String(row.fx).padStart(5)}`,
      );
    }
    say(`  ${scene}: ${built.bodies} bodies, ${built.towers} turrets, sim step ${built.simStep.toFixed(1)}ms on the worker, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
} catch (e) {
  console.error(e.stack ?? String(e));
  failed = true;
  rows.push({ error: e.message });
} finally {
  await browser.close();
  server.close();
}

const worst = rows.filter((r) => !r.error).reduce((a, r) => (a && a.drawMed >= r.drawMed ? a : r), null);
say(
  `\n${failed ? "SLOW" : "fast"}: draw median against ${DRAW_GOAL_MS}ms at every zoom` +
    (worst ? ` — worst ${worst.scene} at zoom ${worst.zoom.toFixed(2)}, ${worst.drawMed.toFixed(1)}ms (p95 ${worst.drawP95.toFixed(1)})` : "") +
    `\n(frame column is SwiftShader's, not a GPU's — read the draw)`,
);
if (JSON_OUT)
  process.stdout.write(
    JSON.stringify({ goalMs: DRAW_GOAL_MS, world: WORLD, n: N, viewport: [VW, VH], software, rows }) + "\n",
  );
process.exit(rows.some((r) => r.error) ? 2 : failed && !JSON_OUT ? 1 : 0);
