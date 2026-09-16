/**
 * Whitepeak — the open board. Rock threshold 0.54 leaves 49% open ice
 * with almost no chokes in it, so nothing here is defensible by terrain
 * and every position is bought rather than found. Four hilltops sit
 * equidistant from the core and the nearest gate: whoever reaches one
 * first keeps it.
 *
 *   node scripts/maps/whitepeak.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: RACE THE ENEMY (docs/mission-design.md).
 *
 * A SKETCH, NOT A CAMPAIGN MAP. Its id is deliberately absent from
 * OFFICIAL_MAP_IDS (game/maps.ts) and no world claims it, so nothing
 * loads it and nothing plays it — running this file writes
 * public/maps/whitepeak.json like any other spec, and listing the id is what
 * would make it a map. The pipeline and every rule are in mindustry.mjs;
 * this file is the numbers.
 */
import {
  run, FLOOR_ICE, FLOOR_SALT, FLOOR_SNOW, WALL_ICE, WALL_SALT, WALL_SNOW
} from "./mindustry.mjs";

/** a lake: pulls the water noise down round a point */
const well = (cx, cy, r, depth) => (x, y) =>
  -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));

export const spec = {
  id: "whitepeak", name: "Whitepeak",
  seed: 0x117e,
  rock: { threshold: 0.54, scale: 30, warp: 16 },
  water: { scale: 60, level: 0.26, shore: 0.06, bias: (x, y) => 0.2 + well(60, 60, 14, 0.5)(x, y) },
  floors: { scale: 40, warp: 14, families: [
    { floor: FLOOR_ICE, wall: WALL_ICE, weight: 0.5 },
    { floor: FLOOR_SNOW, wall: WALL_SNOW, weight: 0.32 },
    { floor: FLOOR_SALT, wall: WALL_SALT, weight: 0.18 },
  ] },
  beach: { floor: FLOOR_SNOW, depth: 2 },
  flats: { floor: FLOOR_SALT, clear: 14 },
  rooms: [
    { x: 128, y: 128, r: 24, wobble: 0.24 }, // 0 the shelf
    { x: 128, y: 70, r: 13 },  // 1
    { x: 128, y: 186, r: 13 }, // 2
    { x: 70, y: 128, r: 13 },  // 3
    { x: 186, y: 128, r: 13 }, // 4
    { x: 70, y: 66, r: 9, water: true }, // 5 the tarn
  ],
  core: { x: 126, y: 126, r: 10 },
  spawns: [
    { x: 128, y: 18, r: 12, zone: "ground" },
    { x: 128, y: 238, r: 12, zone: "ground" },
    { x: 18, y: 128, r: 12, zone: "ground" },
    { x: 238, y: 128, r: 12, zone: "ground" },
    { x: 20, y: 236, r: 8, zone: "air" },
    { x: 236, y: 20, r: 8, zone: "air" },
    { x: 20, y: 20, r: 9, zone: "water" },
  ],
  routes: [
    { spawn: 6, to: 5, layer: "water", width: [17, 23] },
    { spawn: 0, via: [1], width: [9, 16] },
    { spawn: 1, via: [2], width: [9, 16] },
    { spawn: 2, via: [3], width: [9, 16] },
    { spawn: 3, via: [4], width: [9, 16] },
  ],
  links: [
    { rooms: [1, 3], width: [8, 11] }, { rooms: [1, 4], width: [8, 11] },
    { rooms: [2, 3], width: [8, 11] }, { rooms: [2, 4], width: [8, 11] },
  ],
  chokes: [],
  holes: 8, lumps: 20, ruins: 2, coreWaterReach: 110,
};

run(spec);
