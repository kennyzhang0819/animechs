// IMPORT A MINDUSTRY MAP AS A REFERENCE DOCUMENT.
//
//   node scripts/maps/import-msav.mjs groundZero frozenForest ...
//
// Fetches <name>.msav from Mindustry's repository (core/assets/maps/serpulo),
// reads it, and writes public/maps/<slug>.json in this game's own document
// shape — for its SHAPE, not its paint: the sizes, the canyons, the way a
// Mindustry map bends its lanes. Rock is rock in whichever family reads
// closest, floors collapse to a few families, deep water is deep water,
// pines are pines. Spawn overlays become ground and air drop zones; the
// player's core becomes the map's core, its 5x5 carved open; the rim is
// sealed and the core re-sited exactly as seal.mjs does for an authored
// map, so a reference plays by the same rule as the campaign.
//
// The imported document is a reference: it appears in the map editor
// (OFFICIAL_MAP_IDS in game/maps.ts names it) and no world plays it.
//
// Mindustry's y axis runs UP from the bottom row; this game's documents
// run down from the top, so rows are flipped on the way in.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { seal, placeCore } from "./seal.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW = "https://raw.githubusercontent.com/Anuken/Mindustry/master/core/assets/maps/serpulo";
const COLS = 512;
const ROWS = 512;
const CELL = 20;
const WALL_PINE = 4;
const WALL_DEEP = 7;

// ---------- the save format (mindustry/io/SaveVersion.java) ----------

/**
 * The whole file is one zlib stream: "MSAV", an int version, then regions
 * (int length + body): meta, content names, map. Version 12+ puts a data
 * patch region before the content names; version 11 puts it after. The map
 * region is width, height, a run-length floor pass (floor id, overlay id,
 * run) and a block pass (block id, a packed flag byte; a building carries
 * a length-prefixed entity chunk whose bytes 1..7 are revision, health and
 * team; a plain block carries a run).
 */
function parseMsav(buf) {
  const raw = zlib.inflateSync(buf);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let p = 0;
  const u8 = () => raw[p++];
  const i8 = () => dv.getInt8(p++);
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const i16 = () => { const v = dv.getInt16(p); p += 2; return v; };
  const i32 = () => { const v = dv.getInt32(p); p += 4; return v; };
  const utf = () => { const n = u16(); const s = raw.subarray(p, p + n).toString("utf8"); p += n; return s; };
  if (raw.subarray(0, 4).toString() !== "MSAV") throw new Error("not a Mindustry save");
  p = 4;
  const version = i32();
  const region = (fn) => { const len = i32(); const end = p + len; const r = fn(); p = end; return r; };
  const meta = region(() => { const n = i16(); const m = {}; for (let i = 0; i < n; i++) { const k = utf(); m[k] = utf(); } return m; });
  if (version >= 12) region(() => {});
  const names = region(() => {
    const mapped = u8(); const out = {};
    for (let i = 0; i < mapped; i++) { const type = i8(); const total = i16(); const arr = []; for (let j = 0; j < total; j++) arr.push(utf()); out[type] = arr; }
    return out;
  });
  if (version === 11) region(() => {});
  const blocks = names[1]; // ContentType.block
  const map = region(() => {
    const w = u16(), h = u16(), n = w * h;
    const floor = new Int16Array(n), overlay = new Int16Array(n), block = new Int16Array(n), team = new Int8Array(n);
    for (let i = 0; i < n; i++) { const f = i16(), o = i16(), c = u8(); for (let j = i; j <= i + c && j < n; j++) { floor[j] = f; overlay[j] = o; } i += c; }
    for (let i = 0; i < n; i++) {
      const b = i16(); const packed = i8();
      const hadEntity = (packed & 1) !== 0, hadData = (packed & 4) !== 0;
      let center = true;
      if (hadData) { p += 3; i32(); }
      if (hadEntity) center = u8() !== 0;
      if (center) block[i] = b;
      if (hadEntity) { if (center) { const len = i32(); team[i] = raw[p + 1 + 4 + 1]; p += len; } }
      else if (!hadData) { const c = u8(); for (let j = i + 1; j <= i + c && j < n; j++) block[j] = b; i += c; }
    }
    return { w, h, floor, overlay, block, team };
  });
  return { version, meta, blocks, ...map };
}

// ---------- Mindustry's terrain → this game's families ----------

// floor family bases (atlas.ts UV_FLOORS): three variants each
const F = { grass: 0, stone: 3, dirt: 6, sand: 9, darksand: 12, shallow: 15, deep: 18, moss: 21, sporeMoss: 24, mud: 27, shale: 30, snow: 33, salt: 36, ice: 39, basalt: 42, tainted: 45, deepTainted: 48 };
const FLOOR_OF = [
  [/^(deep-water|deep-tainted-water)$/, "deep"],
  [/^deep-tainted/, "deepTainted"],
  [/tainted-water|darksand-tainted/, "tainted"],
  [/water$/, "shallow"],
  [/^(snow|ice-snow)$/, "snow"],
  [/^ice$/, "ice"],
  [/^(basalt|hotrock|magmarock|char)$/, "basalt"],
  [/^(moss)$/, "moss"],
  [/^(spore-moss)$/, "sporeMoss"],
  [/^(mud|tar)$/, "mud"],
  [/^(shale|dacite)$/, "shale"],
  [/^(salt)$/, "salt"],
  [/^(sand-floor)$/, "sand"],
  [/^(darksand)$/, "darksand"],
  [/^(dirt)$/, "dirt"],
  [/^(grass)$/, "grass"],
  [/^(stone|metal|dark-panel|core-zone|space)/, "stone"],
];
const floorFamily = (name) => { for (const [re, fam] of FLOOR_OF) if (re.test(name)) return fam; return "stone"; };

// wall family bases (atlas.ts UV_WALLS): two variants each; 0 stone, 2 dirt,
// 5 dark rock, then the second band
const W = { stone: 0, dirt: 2, dark: 5, spore: 8, shale: 10, snow: 12, ice: 14, salt: 16, sand: 18, dune: 20, dacite: 22 };
const WALL_OF = [
  [/^(snow-wall)$/, "snow"], [/^(ice-wall)$/, "ice"], [/^(salt-wall)$/, "salt"], [/^(sand-wall)$/, "sand"],
  [/^(dune-wall)$/, "dune"], [/^(dacite-wall)$/, "dacite"], [/^(shale-wall)$/, "shale"], [/^(spore-wall)$/, "spore"],
  [/^(dirt-wall)$/, "dirt"], [/^(stone-wall)$/, "stone"], [/^(dark-metal|cliff|carbon-wall)$/, "dark"],
];
const wallFamily = (name) => { for (const [re, fam] of WALL_OF) if (re.test(name)) return fam; return null; };
const PINE = { pine: 0, "spore-pine": 1, "snow-pine": 2 };

const mulberry32 = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** the map's own name, slugged: "Ground Zero" → "ground-zero" */
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function convert(msav, seed = 7) {
  const rng = mulberry32(seed);
  const w = Math.min(COLS, msav.w), rows = Math.min(ROWS, msav.h);
  if (w < msav.w || rows < msav.h)
    console.warn(`${msav.meta.name}: ${msav.w}x${msav.h} is larger than the ${COLS}x${ROWS} grid — cropped to the top-left`);
  const n = w * rows;
  const floor = new Array(n).fill(F.stone), wall = new Array(n).fill(0), blocked = new Array(n).fill(0);
  const pines = [];
  const spawns = [];
  let core = null;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < w; x++) {
      // flip: Mindustry's row 0 is the bottom
      const src = (msav.h - 1 - y) * msav.w + x;
      const i = y * w + x;
      const fname = msav.blocks[msav.floor[src]] ?? "stone";
      const fam = floorFamily(fname);
      floor[i] = F[fam] + ((rng() * 3) | 0);
      if (fam === "deep" || fam === "deepTainted") { blocked[i] = 1; wall[i] = WALL_DEEP; }
      const bname = msav.blocks[msav.block[src]] ?? "air";
      const wf = wallFamily(bname);
      if (wf) { blocked[i] = 1; wall[i] = W[wf] + ((rng() * 2) | 0); }
      else if (bname in PINE) {
        blocked[i] = 1; wall[i] = WALL_PINE;
        if (fam === "deep" || fam === "deepTainted") floor[i] = F.darksand;
        pines.push({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL, size: CELL * 1.5, rot: ((rng() * 4) | 0) * (Math.PI / 2), kind: PINE[bname] });
      }
      if (bname.startsWith("core-") && msav.team[src] === 1 && !core) core = { x, y };
      if (msav.blocks[msav.overlay[src]] === "spawn") {
        spawns.push({ x: x + 0.5, y: y + 0.5, r: 14, zone: "ground" });
        spawns.push({ x: x + 0.5, y: y + 0.5, r: 8, zone: "air" });
      }
    }
  const m = { id: slug(msav.meta.name), name: msav.meta.name, w, base: { x: 0, y: 0 }, floor, wall, blocked, spawns, pines, decor: [] };
  // the core: the player's, carved open; failing one, the open ground
  // nearest the map's centre
  const want = core ? { x: core.x, y: core.y } : { x: w / 2, y: rows / 2 };
  if (core)
    for (let y = core.y - 2; y <= core.y + 2; y++)
      for (let x = core.x - 2; x <= core.x + 2; x++) {
        if (x < 0 || y < 0 || x >= w || y >= rows) continue;
        const i = y * w + x;
        blocked[i] = 0; wall[i] = 0;
        if ((floor[i] / 3 | 0) === 5 || (floor[i] / 3 | 0) === 6 || (floor[i] / 3 | 0) === 15 || (floor[i] / 3 | 0) === 16) floor[i] = F.darksand;
      }
  seal(m);
  const spot = placeCore(m, want);
  if (!spot) throw new Error(`${m.name}: no open 5x5 ground for a core`);
  m.base = spot;
  return m;
}

const here = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (here) {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error("usage: node scripts/maps/import-msav.mjs <mapName> ...   (e.g. groundZero frozenForest)");
    process.exit(1);
  }
  const cache = path.join(os.tmpdir(), "mindustry-maps");
  fs.mkdirSync(cache, { recursive: true });
  for (const name of names) {
    const file = path.join(cache, `${name}.msav`);
    if (!fs.existsSync(file)) {
      const res = await fetch(`${RAW}/${name}.msav`);
      if (!res.ok) throw new Error(`${name}: ${res.status} from GitHub`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
    const msav = parseMsav(fs.readFileSync(file));
    const m = convert(msav);
    const out = path.join(ROOT, "public", "maps", `${m.id}.json`);
    fs.writeFileSync(out, JSON.stringify(m));
    const rock = m.blocked.filter((b) => b).length;
    console.log(`${name}: "${m.name}" ${msav.w}x${msav.h} -> ${out} — ${Math.round((100 * rock) / m.blocked.length)}% blocked, core at ${m.base.x},${m.base.y}, ${m.spawns.length / 2} spawn(s), ${m.pines.length} pines`);
  }
}
