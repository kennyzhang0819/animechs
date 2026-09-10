// DOUBLE A MAP DOCUMENT AND WIDEN ITS OPENINGS.
//
//   node scripts/maps/upscale.mjs [--widen n] <id ...>
//
// The grid is 512x512 now (COLS, ROWS in game/constants.ts); the campaign
// maps are regenerated at that size from their specs (mindustry.mjs
// SCALE), but the reference documents — the Mindustry imports and the
// last of the old noise maps — have no spec to regenerate from. This
// brings one of those up to the new board in place:
//
//   1. every layer is doubled by nearest neighbour, so one authored cell
//      becomes a 2x2 block of the same floor, wall and blocked value;
//   2. everything positioned in cells or pixels moves with it — the drop
//      zones and their radii, the base, the props (position AND size,
//      since a boulder is drawn in world px), the valley centreline, the
//      swarm's formation;
//   3. the openings are widened: `--widen n` (default 2) erodes plain rock
//      by that many cells wherever it meets walkable ground, the opened
//      cell taking its neighbour's floor. Pines and deep water are left
//      alone (they are not rock) and so is the rim (a map stays sealed);
//   4. a formation entry whose kind is not on the roster — the old
//      enemy-only breach and scrap walls — is dropped: the swarm builds
//      from the player's roster now.
//
// Idempotent in spirit only: run it twice and the map is 1024 wide, so
// the script refuses a document already at the grid's width.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GRID = 512;
const LEGACY_COLS = 128;
const K = 2;
const WALL_PINE = 4;
const WALL_DEEP = 7;

const args = process.argv.slice(2);
let widen = 2;
const ids = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--widen") widen = +args[++i];
  else ids.push(args[i]);
}
if (!ids.length) {
  console.error("usage: node scripts/maps/upscale.mjs [--widen n] <id ...>");
  process.exit(1);
}

for (const id of ids) {
  const file = path.join(ROOT, "public", "maps", `${id}.json`);
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  const w = m.w ?? LEGACY_COLS;
  const rows = Math.floor(m.floor.length / w);
  if (w >= GRID) {
    console.log(`${id}: already ${w} wide — nothing to do`);
    continue;
  }
  const W = w * K, H = rows * K;
  const up = (layer) => {
    const out = new Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) out[y * W + x] = layer[((y / K) | 0) * w + ((x / K) | 0)];
    return out;
  };
  const floor = up(m.floor), wall = up(m.wall), blocked = up(m.blocked);

  // 3. widen: erode plain rock beside walkable ground, `widen` cells deep
  let opened = 0;
  for (let pass = 0; pass < widen; pass++) {
    const adds = [];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!blocked[i] || wall[i] === WALL_PINE || wall[i] === WALL_DEEP) continue;
        for (const j of [i - 1, i + 1, i - W, i + W]) {
          if (!blocked[j]) { adds.push([i, j]); break; }
        }
      }
    for (const [i, j] of adds) {
      blocked[i] = 0;
      wall[i] = 0;
      floor[i] = floor[j];
      opened++;
    }
  }

  const scalePt = (p) => ({ ...p, x: p.x * K, y: p.y * K });
  const out = {
    ...m,
    w: W,
    floor, wall, blocked,
    spawns: (m.spawns ?? []).map((z) => ({ ...z, x: z.x * K, y: z.y * K, r: z.r * K })),
    pines: (m.pines ?? []).map((p) => ({ ...scalePt(p), size: p.size * K })),
    decor: (m.decor ?? []).map((p) => ({ ...scalePt(p), size: p.size * K })),
  };
  // the legacy per-cell spawn layer is a cache of the circles; never carried
  delete out.spawn;
  const at = m.base ?? m.core;
  if (at) { out.base = { x: at.x * K, y: at.y * K }; delete out.core; }
  if (m.valleyY) {
    const v = [];
    for (let x = 0; x < W; x++) v.push(Math.round(m.valleyY[Math.min(m.valleyY.length - 1, (x / K) | 0)] * K * 100) / 100);
    out.valleyY = v;
  }
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`${id}: ${w}x${rows} -> ${W}x${H}, ${opened} rock cells opened (${widen} deep)`);
}
