#!/usr/bin/env node
/**
 * THE STYLE SHOTS (docs/style-concepts.html): the real Game on a rolled board,
 * a ring of every fielded turret round the core and the run's ground families
 * walking in, frozen, then drawn once per art style (game/artStyle.ts) and
 * screenshotted into docs/style-concepts/<style>-<view>.png.
 *
 *   node scripts/style-shots.mjs --styles base,inked --views near,mid,far,cliff
 *   node scripts/style-shots.mjs --seed 7 --settle 900 --sample-palette
 *
 * Serves the game the way scripts/bench.mjs does (the same transpile, the
 * same headers) and drives scripts/style/style.js through window.__shots.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.join(path.dirname(fileURLToPath(import.meta.url)), "style");
const ROOT = path.resolve(HERE, "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { chromium } = require("playwright");
const DIST = path.join(ROOT, ".playtest", "bench");
const OUT = process.env.SHOTS_OUT ?? path.join(ROOT, "docs", "style-concepts");
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; };
const STYLES = opt("--styles", "base").split(",");
const SEED = opt("--seed", "7");
const VIEWS = opt("--views", "near,mid").split(",");
const [VW, VH] = opt("--viewport", "1280x800").split("x").map(Number);
const HEADED = argv.includes("--headed");
/** --pixel block: the art re-pixelled at pack time (game/pixelStyle.ts); --tag names the files */
const PIXEL = opt("--pixel", "foundry");
const TAG = opt("--tag", "");

const run = (cmd, args) => new Promise((done) => {
  const p = spawn(cmd, args, { cwd: ROOT, shell: process.platform === "win32" });
  let out = "", err = "";
  p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
  p.on("close", (code) => done({ code, out, err }));
});
const newestSource = () => {
  let newest = 0;
  for (const e of fs.readdirSync(path.join(ROOT, "game"))) if (e.endsWith(".ts")) newest = Math.max(newest, fs.statSync(path.join(ROOT, "game", e)).mtimeMs);
  return newest;
};
spawnSync(process.execPath, [path.join(ROOT, "scripts", "sync-foundry-art.mjs")], { cwd: ROOT, stdio: "ignore" });
const built = path.join(DIST, "game", "game.js");
if (!fs.existsSync(built) || newestSource() > fs.statSync(built).mtimeMs) {
  const t0 = Date.now();
  const r = await run("npx.cmd", ["tsc",
    "game/game.ts", "game/sim.worker.ts", "game/field.worker.ts", "game/phys.worker.ts",
    "game/ladder.ts", "game/track.ts", "game/upgrades.ts", "game/mods.ts", "game/relics.ts",
    "game/maps.ts", "game/levels.ts", "game/types.ts", "game/constants.ts",
    "--outDir", DIST, "--rootDir", ROOT, "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler",
    "--lib", "dom,dom.iterable,esnext", "--skipLibCheck", "--esModuleInterop", "--resolveJsonModule", "--noEmitOnError", "false"]);
  if (!fs.existsSync(built)) { console.error((r.out + r.err).trim()); process.exit(2); }
  console.log(`transpiled in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const MIME = { ".js": "text/javascript", ".json": "application/json", ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".wasm": "application/wasm" };
const PUBLIC = path.join(ROOT, "public");
const resolveFile = (url) => {
  const p = decodeURIComponent(url.split("?")[0]);
  if (p === "/" || p === "/index.html") return path.join(HERE, "index.html");
  if (p === "/style.js") return path.join(HERE, "style.js");
  if (p.startsWith("/game/")) { let f = p.slice(1); if (f.endsWith(".ts")) f = `${f.slice(0, -3)}.js`; else if (!path.extname(f)) f = `${f}.js`; return path.join(DIST, f); }
  return path.join(PUBLIC, p);
};
const server = http.createServer((req, res) => {
  if (req.url === "/favicon.ico") { res.statusCode = 204; res.end(); return; }
  const file = path.normalize(resolveFile(req.url ?? "/"));
  const ok = fs.existsSync(file) && fs.statSync(file).isFile();
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cache-Control", "no-store");
  if (!ok) { res.statusCode = 404; res.end("not found"); return; }
  res.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
  if (file === path.join(DIST, "game", "env.js")) { res.end(`const process = globalThis.process ?? { env: {} };\n${fs.readFileSync(file, "utf8")}`); return; }
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: !HEADED, args: ["--no-sandbox", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
try {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5 * 60 * 1000);
  page.on("pageerror", (e) => console.log(`  page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning" || argv.includes("--verbose")) console.log(`  console.${m.type()}: ${m.text()}`); });
  await page.goto(`${origin}/?seed=${SEED}&pixel=${PIXEL}`);
  await page.waitForFunction(() => window.__shots?.ready === true);
  fs.mkdirSync(OUT, { recursive: true });
  const VIEW = { near: [12, 120, 60], mid: [7, 0, 0], far: [3.5, 0, 0], cliff: [7, 0, 0] };
  const info = await page.evaluate(() => window.__shots.setup());
  console.log(`scene: ${JSON.stringify(info)}`);
  const made = await page.evaluate(() => window.__shots.spawn(Number(new URLSearchParams(location.search).get('n') ?? 40)));
  console.log(`spawned ${JSON.stringify(made)}`);
  await page.waitForTimeout(Number(opt("--settle", 500)));
  await page.evaluate(() => window.__shots.freeze(true));
  const wall = await page.evaluate(() => window.__shots.nearestWall());
  console.log(`nearest wall: ${JSON.stringify(wall)}`);
  if (wall) VIEW.cliff = [7, wall.x - info.core.x, wall.y - info.core.y];
  if (argv.includes("--sample-palette")) {
    await page.evaluate(({ z, dx, dy }) => window.__shots.shot(z, dx, dy, 2), { z: 3.5, dx: 0, dy: 0 });
    const pal = await page.evaluate(() => window.__shots.samplePalette(32));
    console.log(`palette: ${JSON.stringify(pal)}`);
    fs.writeFileSync(path.join(OUT, "palette.json"), JSON.stringify(pal));
  }
  for (const style of STYLES) {
    const ok = await page.evaluate((s) => window.__shots.style(s), style);
    if (!ok && style !== "base") console.log(`  style ${style}: renderer has no setStyle, shot is the base look`);
    for (const v of VIEWS) {
      const [z, dx, dy] = VIEW[v];
      const s = await page.evaluate(({ z, dx, dy }) => window.__shots.shot(z, dx, dy, 2), { z, dx, dy });
      const file = path.join(OUT, `${TAG || style}-${v}.png`);
      await page.screenshot({ path: file });
      console.log(`  ${path.basename(file)}: ${JSON.stringify(s)}`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
