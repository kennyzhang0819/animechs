/**
 * Spore Ring — the swamp, the core dead centre, six arcs in, three of
 * them holding an arena worth owning. A tainted river runs the width of
 * the board under the core, so the amphibious front is always open and
 * the arenas are half-flooded.
 *
 *   node scripts/maps/sporering.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: HOLD REMOTE GROUND (docs/mission-design.md).
 *
 * A SKETCH, NOT A CAMPAIGN MAP. Its id is deliberately absent from
 * OFFICIAL_MAP_IDS (game/maps.ts) and no world claims it, so nothing
 * loads it and nothing plays it — running this file writes
 * public/maps/sporering.json like any other spec, and listing the id is what
 * would make it a map. The pipeline and every rule are in mindustry.mjs;
 * this file is the numbers.
 */
import {
  run, FLOOR_DEEP_TAINTED_WATER, FLOOR_MOSS, FLOOR_MUD, FLOOR_SHALE,
  FLOOR_SPORE_MOSS, FLOOR_TAINTED_WATER, WALL_DUNE, WALL_SHALE, WALL_SPORE
} from "./mindustry.mjs";

/** a lake: pulls the water noise down round a point */
const well = (cx, cy, r, depth) => (x, y) =>
  -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));

export const spec = {
  id: "sporering", name: "Spore Ring",
  seed: 0x5909,
  rock: { threshold: 0.395, scale: 24, warp: 15 },
  water: {
    scale: 50, level: 0.34, shore: 0.09, warp: 20,
    shallow: FLOOR_TAINTED_WATER, deep: FLOOR_DEEP_TAINTED_WATER,
    bias: (x, y) => 0.1 + well(128, 128, 40, -0.14)(x, y),
  },
  floors: { scale: 34, warp: 14, families: [
    { floor: FLOOR_MOSS, wall: WALL_SPORE, weight: 0.46 },
    { floor: FLOOR_SPORE_MOSS, wall: WALL_SPORE, weight: 0.24 },
    { floor: FLOOR_MUD, wall: WALL_DUNE, weight: 0.18 },
    { floor: FLOOR_SHALE, wall: WALL_SHALE, weight: 0.12 },
  ] },
  beach: { floor: FLOOR_MUD, depth: 2 },
  flats: { floor: FLOOR_MUD, clear: 11 },
  rooms: [
    { x: 128, y: 128, r: 22, wobble: 0.22 }, // 0 the middle
    { x: 128, y: 66, r: 11 },  // 1 n
    { x: 128, y: 190, r: 11 }, // 2 s
    { x: 66, y: 128, r: 11 },  // 3 w
    { x: 190, y: 128, r: 11 }, // 4 e
    { x: 78, y: 78, r: 11 },   // 5 nw
    { x: 178, y: 178, r: 11 }, // 6 se
    // the three arenas, each off an arc
    { x: 74, y: 196, r: 14 },  // 7
    { x: 196, y: 68, r: 14 },  // 8
    { x: 208, y: 210, r: 14 }, // 9
    { x: 108, y: 172, r: 9, water: true }, // 10 the pool
  ],
  core: { x: 126, y: 126, r: 10 },
  spawns: [
    { x: 128, y: 16, r: 12, zone: "ground" },
    { x: 128, y: 240, r: 12, zone: "ground" },
    { x: 16, y: 128, r: 12, zone: "ground" },
    { x: 240, y: 128, r: 12, zone: "ground" },
    { x: 38, y: 38, r: 12, zone: "ground" },
    { x: 218, y: 218, r: 12, zone: "ground" },
    { x: 22, y: 22, r: 8, zone: "air" },
    { x: 234, y: 234, r: 8, zone: "air" },
    { x: 18, y: 176, r: 9, zone: "water" },
    { x: 238, y: 176, r: 9, zone: "water" },
  ],
  routes: [
    { spawn: 8, to: 10, layer: "water", width: [17, 23] },
    { spawn: 9, to: 10, layer: "water", width: [17, 23] },
    { spawn: 0, via: [1], width: [8, 14] },
    { spawn: 1, via: [2], width: [8, 14] },
    { spawn: 2, via: [3], width: [8, 14] },
    { spawn: 3, via: [4], width: [8, 14] },
    { spawn: 4, via: [5], width: [8, 14] },
    { spawn: 5, via: [6], width: [8, 14] },
  ],
  links: [
    { rooms: [1, 5], width: [7, 10] }, { rooms: [5, 3], width: [7, 10] },
    { rooms: [2, 6], width: [7, 10] }, { rooms: [6, 4], width: [7, 10] },
    { rooms: [3, 7], width: [6, 9] }, { rooms: [2, 7], width: [6, 9] },
    { rooms: [4, 8], width: [6, 9] }, { rooms: [1, 8], width: [6, 9] },
    { rooms: [6, 9], width: [6, 9] },
  ],
  chokes: [
    { x: 128, y: 100, w: 10, reach: 7 }, { x: 128, y: 156, w: 10, reach: 7 },
    { x: 100, y: 128, w: 10, reach: 7 }, { x: 156, y: 128, w: 10, reach: 7 },
  ],
  holes: 6, lumps: 16, ruins: 2, coreWaterReach: 60,
};

run(spec);
