import { Game } from "/game/game.js";
import { SWARM_WORLD, FAMILIES, loadLevelDocs, rollFamilies, transformScript } from "/game/levels.js";
import { loadOfficialMaps } from "/game/maps.js";
import { specForTier } from "/game/ladder.js";
import { techStateFor } from "/game/track.js";
import { FIELDED_KINDS } from "/game/types.js";
import { CELL, COLS, ROWS } from "/game/constants.js";
import { showsFloorCell } from "/game/terrain.js";
import { setPixelStyle } from "/game/pixelStyle";

const q = new URLSearchParams(location.search);
const SEED = Number(q.get("seed") ?? 7);
const TIER = Number(q.get("tier") ?? 3);
setPixelStyle(q.get("pixel") === "block" || q.get("pixel") === "vox" ? q.get("pixel") : "foundry");
const log = (s) => { document.getElementById("log").textContent = s; console.log(`[shots] ${s}`); };

let rand = SEED;
Math.random = () => {
  rand = (rand + 0x6d2b79f5) >>> 0;
  let t = rand;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

await Promise.all([loadLevelDocs(), loadOfficialMaps()]);

let game = null;
const gl = document.getElementById("gl"), ui = document.getElementById("ui"), mm = document.getElementById("mm");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

window.__shots = {
  ready: true,
  families: [],
  async setup() {
    rand = SEED;
    const world = { ...SWARM_WORLD, mapSeed: SEED };
    const base = specForTier(world, TIER);
    const families = rollFamilies(Math.random, base.script, []);
    const spec = { ...base, script: [], families };
    this.families = families;
    if (game) { game.destroy(); game = null; }
    game = await Game.create(gl, ui, spec, (step) => log(`loading: ${step}`));
    game.attachMinimap(mm);
    window.__game = game;
    const h = game.benchHost();
    h.setTech(techStateFor(60));
    h.setRich(true);
    h.setBench({ coreHp: 1e12, unitRange: 0 });
    await sleep(300);
    await game.sampleFrames(1);
    const core = game.view.core;
    const cx = core.x / CELL, cy = core.y / CELL;
    let ki = 0;
    for (let t = 0; t < 400; t++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 8;
      const gx = Math.round(cx + Math.cos(a) * r), gy = Math.round(cy + Math.sin(a) * r);
      h.placeTower(gx, gy, FIELDED_KINDS[ki++ % FIELDED_KINDS.length]);
    }
    await sleep(400);
    await game.sampleFrames(1);
    return { families, core: { x: core.x, y: core.y }, towers: game.layout().length };
  },
  spawn(n = 60, rMin = 200, rMax = 330) {
    rand = SEED + 1;
    const h = game.benchHost();
    const core = game.view.core;
    const kinds = FAMILIES.filter((f) => this.families.includes(f.key) && f.layer === "ground").flatMap((f) => f.kinds.slice(0, 3));
    let made = 0;
    for (let i = 0; i < n; i++) {
      const k = kinds[i % kinds.length];
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      h.spawnMany(k, 1, { at: { x: core.x + Math.cos(a) * r, y: core.y + Math.sin(a) * r }, hp: 1e6 });
      made++;
    }
    return { made, kinds };
  },
  async shot(zoom, dx = 0, dy = 0, frames = 2) {
    const core = game.view.core;
    game.setCamera(zoom, core.x + dx, core.y + dy);
    await game.sampleFrames(frames);
    return { zoom: game.stats().zoom, units: game.stats().units, towers: game.layout().length };
  },
  style(name) {
    const r = game.renderer;
    if (r && typeof r.setStyle === "function") { r.setStyle(name); return true; }
    return false;
  },
  freeze(on = true) { game.paused = on; },
  /** the wall cell nearest the core but past `minCells` out, in world px */
  nearestWall(minCells = 14) {
    const T = game.renderer.lastTerrain?.terrain;
    if (!T) return null;
    const core = game.view.core;
    const cx = core.x / CELL, cy = core.y / CELL;
    let best = null, bd = Infinity;
    for (let y = 2; y < ROWS - 2; y++) for (let x = 2; x < COLS - 2; x++) {
      const i = y * COLS + x;
      if (showsFloorCell(T.blocked[i], T.wall[i])) continue;
      // a wall with floor under it, so a face can show, and part of a mass
      if (!showsFloorCell(T.blocked[i + COLS], T.wall[i + COLS])) continue;
      let mass = 0;
      for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) {
        const j = (y + yy) * COLS + x + xx;
        if (!showsFloorCell(T.blocked[j], T.wall[j])) mass++;
      }
      if (mass < 20) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < minCells || d >= bd) continue;
      bd = d; best = { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL, d };
    }
    return best;
  },
  /** k colours clustered off the frame on screen (k-means on a subsample) */
  samplePalette(k = 32) {
    const r = game.renderer;
    const w = r.canvas.width, h = r.canvas.height;
    game.frame(performance.now());
    const px = r.readFrame(0, 0, w, h);
    const pts = [];
    for (let i = 0; i < w * h; i += 7) pts.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
    let cents = [];
    for (let i = 0; i < k; i++) cents.push(pts[(i * 7919) % pts.length].slice());
    for (let it = 0; it < 12; it++) {
      const sum = cents.map(() => [0, 0, 0, 0]);
      for (const p of pts) {
        let bi = 0, bd = Infinity;
        for (let c = 0; c < k; c++) {
          const d = 2 * (p[0] - cents[c][0]) ** 2 + 4 * (p[1] - cents[c][1]) ** 2 + 3 * (p[2] - cents[c][2]) ** 2;
          if (d < bd) { bd = d; bi = c; }
        }
        const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
      }
      cents = sum.map((s, c) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : pts[(c * 104729 + it) % pts.length].slice()));
    }
    const hex = (v) => Math.round(v).toString(16).padStart(2, "0");
    return cents.map((c) => `#${hex(c[0])}${hex(c[1])}${hex(c[2])}`);
  },
  stats: () => game.stats(),
};
log(`ready: seed ${SEED}`);
