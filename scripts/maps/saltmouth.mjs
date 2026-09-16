/**
 * Saltmouth — the estuary. One sea along the north running south down
 * the middle of the board, two land arms either side of it, the core on
 * the southern stem. The west arm opens a firing position onto the
 * ground lane; the east arm is the only ground that reaches the naval
 * gates. Nothing reaches both.
 *
 *   node scripts/maps/saltmouth.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: PICK ONE (docs/mission-design.md).
 *
 * A SKETCH, NOT A CAMPAIGN MAP. Its id is deliberately absent from
 * OFFICIAL_MAP_IDS (game/maps.ts) and no world claims it, so nothing
 * loads it and nothing plays it — running this file writes
 * public/maps/saltmouth.json like any other spec, and listing the id is what
 * would make it a map. The pipeline and every rule are in mindustry.mjs;
 * this file is the numbers.
 */
import {
  run, FLOOR_DARKSAND, FLOOR_SALT, FLOOR_SAND, WALL_DUNE, WALL_SALT,
  WALL_SAND
} from "./mindustry.mjs";

export const spec = {
  id: "saltmouth", name: "Saltmouth",
  seed: 0x5a17,
  rock: { threshold: 0.45, scale: 22, warp: 13 },
  water: {
    scale: 42, level: 0.46, shore: 0.08, warp: 16,
    // sea along the north, drying southward
    // one sea, north, running south down the middle as the estuary;
    // the flanks dry out so the two peninsulas stay land
    bias: (x, y) => -0.14 + Math.max(0, Math.min(1, (y - 26) / 205)) * 0.56 + Math.min(0.40, (Math.abs(x - 128) / 96) * 0.40),
  },
  floors: { scale: 34, warp: 12, families: [
    { floor: FLOOR_SAND, wall: WALL_SAND, weight: 0.5 },
    { floor: FLOOR_SALT, wall: WALL_SALT, weight: 0.26 },
    { floor: FLOOR_DARKSAND, wall: WALL_DUNE, weight: 0.24 },
  ] },
  beach: { floor: FLOOR_DARKSAND, depth: 3 },
  flats: { floor: FLOOR_SALT, clear: 10 },
  rooms: [
    { x: 128, y: 200, r: 16 }, // 0 the stem
    { x: 78, y: 158, r: 13 },  // 1 west arm foot
    { x: 62, y: 104, r: 13, dry: true },  // 2 west arm
    { x: 54, y: 56, r: 12, dry: true },   // 3 west head
    { x: 178, y: 158, r: 13 }, // 4 east arm foot
    { x: 196, y: 106, r: 13, dry: true }, // 5 east arm
    { x: 206, y: 58, r: 12, dry: true },  // 6 east head
    { x: 128, y: 96, r: 14, water: true },// 7 the channel between them
    { x: 128, y: 168, r: 11, water: true },// 8 the estuary head, below the stem
  ],
  core: { x: 126, y: 226, r: 9 },
  spawns: [
    { x: 26, y: 34, r: 12, zone: "ground" },
    { x: 86, y: 22, r: 12, zone: "ground" },
    { x: 172, y: 22, r: 12, zone: "ground" },
    { x: 230, y: 36, r: 12, zone: "ground" },
    { x: 14, y: 120, r: 8, zone: "air" },
    { x: 242, y: 120, r: 8, zone: "air" },
    { x: 112, y: 14, r: 10, zone: "water" },
    { x: 148, y: 14, r: 10, zone: "water" },
  ],
  routes: [
    { spawn: 6, via: [7], to: 8, layer: "water", width: [18, 24] },
    { spawn: 7, via: [7], to: 8, layer: "water", width: [18, 24] },
    { spawn: 0, via: [3, 2, 1, 0], width: [8, 14] },
    { spawn: 1, via: [3, 2, 1, 0], width: [8, 14] },
    { spawn: 2, via: [6, 5, 4, 0], width: [8, 14] },
    { spawn: 3, via: [6, 5, 4, 0], width: [8, 14] },
  ],
  links: [
    { rooms: [2, 3], width: [6, 9] }, { rooms: [5, 6], width: [6, 9] },
    { rooms: [1, 2], width: [6, 9] }, { rooms: [4, 5], width: [6, 9] },
  ],
  chokes: [{ x: 128, y: 216, w: 10, reach: 8 }],
  holes: 4, lumps: 10, ruins: 2, coreWaterReach: 70,
};

run(spec);
