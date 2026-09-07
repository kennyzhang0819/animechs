// SEAL A MAP AND SET ITS CORE AT THE END OF THE LANE.
//
//   node scripts/maps/seal.mjs [id ...]      (default: every campaign map)
//
// The swarm no longer leaves the board: there are no exit cells and the
// rim is rock (game/sim.ts — the core is the only destination). This tool
// brings an authored document up to that rule in place:
//
//   1. every border cell of the document's own w x rows becomes rock, in
//      the map's most common wall family, so nothing walks off the edge;
//   2. the exit layer is dropped, and the core (`base`, its 5x5 top-left)
//      is moved to the open ground nearest where the exits were — the end
//      of the lane the drop zones feed — clear of water, rock, props and
//      every drop zone;
//   3. the document is written back, compact, as the editor writes it.
//
// It is idempotent: a sealed document with no exits keeps its core where
// it stands. The importer (import-msav.mjs) uses the same two steps.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LEGACY_COLS = 128;
/** the two blocked kinds that are not rock (terrain.ts) */
const WALL_PINE = 4;
const WALL_DEEP = 7;
/** floor groups that are water (atlas.ts WATER_FLOOR_GROUPS) */
const WATER_GROUPS = new Set([5, 6, 15, 16]);
const isWater = (floor) => WATER_GROUPS.has((floor / 3) | 0);
const CORE = 5;

/** the wall index most of this map's rock wears — what the rim is sealed with */
export function dominantWall(m) {
  const count = new Map();
  for (let i = 0; i < m.blocked.length; i++) {
    if (!m.blocked[i]) continue;
    const w = m.wall[i];
    if (w === WALL_PINE || w === WALL_DEEP) continue;
    count.set(w, (count.get(w) ?? 0) + 1);
  }
  let best = 0, n = -1;
  for (const [w, c] of count) if (c > n) { best = w; n = c; }
  return best;
}

/** rock every border cell of the document; returns how many cells changed */
export function seal(m) {
  const w = m.w ?? LEGACY_COLS;
  const rows = Math.floor(m.floor.length / w);
  const rock = dominantWall(m);
  let changed = 0;
  const onRim = (x, y) => x === 0 || y === 0 || x === w - 1 || y === rows - 1;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < w; x++) {
      if (!onRim(x, y)) continue;
      const i = y * w + x;
      if (m.blocked[i] && m.wall[i] !== WALL_DEEP) continue; // rock or pine already
      m.blocked[i] = 1;
      m.wall[i] = rock;
      changed++;
    }
  // clutter that stood on what is now rock
  const CELL = 20;
  m.decor = (m.decor ?? []).filter((p) => !onRim(Math.floor(p.x / CELL), Math.floor(p.y / CELL)));
  return changed;
}

/**
 * Where the exits were, as a cell: the centroid of the LARGEST band of
 * ground exits (bit 1 of `exits`, or any set cell of a legacy `goal`), or
 * null on a map that never had any. The largest band rather than the
 * centroid of all of them, because a lane that forks to the rim in two
 * places has its centroid in the rock between the forks — confluence does
 * exactly that — and a core belongs at the end of one arm, not inside a
 * hill halfway between two.
 */
export function exitCentroid(m) {
  const w = m.w ?? LEGACY_COLS;
  const src = m.exits ?? m.goal;
  if (!src) return null;
  const rows = Math.floor(src.length / w);
  const isExit = (i) => src[i] && (!m.exits || (src[i] & 1));
  const seen = new Uint8Array(src.length);
  let best = null;
  for (let s = 0; s < src.length; s++) {
    if (seen[s] || !isExit(s)) continue;
    // flood one 8-connected band
    const stack = [s];
    seen[s] = 1;
    let sx = 0, sy = 0, n = 0;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = Math.floor(i / w);
      sx += x; sy += y; n++;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= rows) continue;
          const j = ny * w + nx;
          if (seen[j] || !isExit(j)) continue;
          seen[j] = 1;
          stack.push(j);
        }
    }
    if (!best || n > best.n) best = { x: sx / n, y: sy / n, n };
  }
  return best && { x: best.x, y: best.y };
}

/**
 * The 5x5 footprint of open dry ground nearest a target cell, at least one
 * cell in from the rim and clear of every drop zone (a corked door spawns
 * nothing) — the core's new top-left, or null if the map has no such
 * ground at all.
 */
export function placeCore(m, target) {
  const w = m.w ?? LEGACY_COLS;
  const rows = Math.floor(m.floor.length / w);
  const zones = m.spawns ?? [];
  const ok = (gx, gy) => {
    if (gx < 1 || gy < 1 || gx + CORE > w - 1 || gy + CORE > rows - 1) return false;
    for (let y = gy; y < gy + CORE; y++)
      for (let x = gx; x < gx + CORE; x++) {
        const i = y * w + x;
        if (m.blocked[i] || isWater(m.floor[i])) return false;
      }
    const cx = gx + CORE / 2, cy = gy + CORE / 2;
    for (const z of zones) if (Math.hypot(z.x - cx, z.y - cy) <= z.r + CORE) return false;
    return true;
  };
  let best = null, bd = Infinity;
  for (let gy = 1; gy + CORE <= rows - 1; gy++)
    for (let gx = 1; gx + CORE <= w - 1; gx++) {
      const d = Math.hypot(gx + CORE / 2 - target.x, gy + CORE / 2 - target.y);
      if (d >= bd || !ok(gx, gy)) continue;
      bd = d;
      best = { x: gx, y: gy };
    }
  return best;
}

/** seal, re-site the core where the exits were, and drop the exit layer */
export function sealDocument(m) {
  const sealed = seal(m);
  const at = exitCentroid(m);
  let moved = null;
  if (at) {
    const spot = placeCore(m, at);
    if (!spot) throw new Error(`${m.id}: no open 5x5 ground near the old exits at ${at.x | 0},${at.y | 0}`);
    moved = spot;
    m.base = spot;
  }
  delete m.exits;
  delete m.goal;
  delete m.core; // the field's old name
  return { sealed, moved, from: at };
}

const here = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (here) {
  const ids = process.argv.slice(2);
  const targets = ids.length ? ids : ["confluence", "maelstrom", "quagmire"];
  for (const id of targets) {
    const file = path.join(ROOT, "public", "maps", `${id}.json`);
    const m = JSON.parse(fs.readFileSync(file, "utf8"));
    const before = JSON.stringify(m.base);
    const r = sealDocument(m);
    fs.writeFileSync(file, JSON.stringify(m));
    console.log(
      `${id}: sealed ${r.sealed} rim cells; core ${before} -> ${JSON.stringify(m.base)}` +
        (r.from ? ` (exits were around ${Math.round(r.from.x)},${Math.round(r.from.y)})` : " (no exits to follow)"),
    );
  }
}
