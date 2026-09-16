/**
 * CUT THE CORRIDOR THE RAILS RUN IN.
 *
 *   node --experimental-transform-types --import ./scripts/ts-hooks.mjs \
 *        scripts/maps/railbed.mjs [--write]
 *
 * A road mission's line is authored on the eight-heading lattice first
 * (game/missions.ts ROAD_SPECS) and the terrain is fitted to it second —
 * which is the reversal that let those lines come out with FEWER corners
 * than the hand-traced ones they replaced. This is the second half: it
 * walks every line and takes the rock out of a corridor either side, so a
 * bed three cells wide is never laid up the face of a cliff.
 *
 * IT IS A PASS OVER THE DOCUMENT, NOT A REGENERATION, and that is the
 * whole point of doing it here rather than in the map's own generator.
 * Re-running scripts/maps/<id>.mjs rewrites the document from its graph
 * and takes the painted spawn tiles and the seeded beacons with it; this
 * touches four fields and leaves everything else exactly as it found it.
 * Run it after a road moves, and after any regeneration of a map that
 * carries one.
 *
 * WHAT IT WILL NOT CUT:
 *
 *   DEEP WATER is not rock — it is the naval layer's own road
 *   (terrain.ts WALL_DEEP), and draining a stretch of it to lay a line
 *   would rewrite the map's fleets, not its scenery. A line crossing it
 *   is reported and left alone: that is a decision for whoever drew the
 *   line, and the answer is usually to move the line.
 *
 *   A BEACON'S OWN GROUND. Beacons stand on the hills (maps.ts
 *   MapBeacon) and a beacon on cleared flat is a beacon standing in a
 *   field. Cells within BEACON_KEEP of one are left as they are and
 *   reported, so a line laid through a beacon is something you are told
 *   about rather than something that quietly happens.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ROAD_SPECS } from "../../game/missions.ts";
import { WALL_DEEP, WALL_PINE } from "../../game/terrain.ts";

/** cells cleared either side of the line: the bed is under three, and a
 *  margin of two beyond it is what stops the bed touching a wall */
const HALF = 3;
/** how close the cutting comes to a beacon before it stops */
const BEACON_KEEP = 3;

const write = process.argv.includes("--write");

/** every cell a line passes through, corner to corner */
function walk(cells) {
  const out = [];
  for (let i = 1; i < cells.length; i++) {
    const [ax, ay] = cells[i - 1], [bx, by] = cells[i];
    const sx = Math.sign(bx - ax), sy = Math.sign(by - ay);
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let t = 0; t < n; t++) out.push([ax + sx * t, ay + sy * t]);
  }
  out.push(cells[cells.length - 1]);
  return out;
}

for (const [id, specs] of Object.entries(ROAD_SPECS)) {
  const file = `public/maps/${id}.json`;
  const m = JSON.parse(readFileSync(file, "utf8"));
  const w = m.w ?? 512;
  const rows = Math.floor(m.floor.length / w);
  // the corridor, and the beacon ground held back out of it
  const corridor = new Set();
  for (const spec of specs)
    for (const [cx, cy] of walk(spec.cells))
      for (let dy = -HALF; dy <= HALF; dy++)
        for (let dx = -HALF; dx <= HALF; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && y >= 0 && x < w && y < rows) corridor.add(y * w + x);
        }
  const held = new Set();
  for (const b of m.beacons ?? [])
    for (let dy = -BEACON_KEEP; dy <= BEACON_KEEP; dy++)
      for (let dx = -BEACON_KEEP; dx <= BEACON_KEEP; dx++) {
        const x = b.x + dx, y = b.y + dy;
        if (x >= 0 && y >= 0 && x < w && y < rows) held.add(y * w + x);
      }

  let cut = 0, sea = 0, kept = 0, trees = 0;
  for (const i of corridor) {
    if (!m.blocked[i]) continue;
    if (m.wall[i] === WALL_DEEP) { sea++; continue; }
    if (held.has(i)) { kept++; continue; }
    if (m.wall[i] === WALL_PINE) trees++;
    m.blocked[i] = 0;
    m.wall[i] = 0;
    cut++;
  }
  // the props standing in it go with the rock: a boulder or a pine left
  // on cleared ground is a boulder in the middle of the track
  const inCorridor = (px, py) => {
    const x = Math.round(px / 20 - 0.5), y = Math.round(py / 20 - 0.5);
    return corridor.has(y * w + x);
  };
  const pines0 = m.pines.length, decor0 = m.decor.length;
  m.pines = m.pines.filter((p) => !inCorridor(p.x, p.y));
  m.decor = m.decor.filter((p) => !inCorridor(p.x, p.y));

  console.log(
    `${id}: cut ${cut} cells of rock (${trees} of them forest), ` +
      `pulled ${pines0 - m.pines.length} pines and ${decor0 - m.decor.length} props` +
      (sea ? ` — ${sea} cells of DEEP WATER left standing in the line` : "") +
      (kept ? ` — ${kept} cells held back off a beacon` : ""),
  );
  if (write) {
    writeFileSync(file, JSON.stringify(m));
    console.log(`  wrote ${file}`);
  }
}
if (!write) console.log("\n(dry run — pass --write to save)");
