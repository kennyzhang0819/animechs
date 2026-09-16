/**
 * Coldline — the tundra, and TWO PARALLEL CONVOY ROADS with the core between them.
 *
 *   node scripts/maps/coldline.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: INTERCEPT THE CROSSER (docs/mission-design.md).
 */
import {
  run, FLOOR_ICE, FLOOR_SNOW, FLOOR_STONE, WALL_DACITE, WALL_ICE,
  WALL_SNOW
} from "./mindustry.mjs";

/** a lake: pulls the water noise down round a point */
const well = (cx, cy, r, depth) => (x, y) =>
  -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));

export const spec = {
  id: "coldline", name: "Coldline",
  seed: 0xc01d,
  rock: { threshold: 0.46, scale: 26, warp: 14 },
  water: { scale: 62, level: 0.3, shore: 0.07, bias: (x, y) => 0.17 + well(128, 214, 15, 0.5)(x, y) },
  floors: { scale: 38, warp: 12, families: [
    { floor: FLOOR_SNOW, wall: WALL_SNOW, weight: 0.58 },
    { floor: FLOOR_ICE, wall: WALL_ICE, weight: 0.24 },
    { floor: FLOOR_STONE, wall: WALL_DACITE, weight: 0.18 },
  ] },
  beach: { floor: FLOOR_ICE, depth: 2 },
  flats: { floor: FLOOR_ICE, clear: 11 },
  rooms: [
    { x: 128, y: 128, r: 22, wobble: 0.24 }, // 0 the middle, round the core
    { x: 36, y: 70, r: 12 },   // 1 north road, west head
    { x: 94, y: 62, r: 12 },   // 2
    { x: 166, y: 64, r: 12 },  // 3
    { x: 222, y: 72, r: 12 },  // 4 north road, east head
    { x: 36, y: 186, r: 12 },  // 5 south road, west head
    { x: 94, y: 194, r: 12 },  // 6
    { x: 166, y: 192, r: 12 }, // 7
    { x: 222, y: 184, r: 12 }, // 8 south road, east head
    { x: 72, y: 128, r: 14 },  // 9 west approach
    { x: 184, y: 128, r: 14 }, // 10 east approach
    { x: 128, y: 174, r: 9, water: true }, // 11 the tarn
  ],
  core: { x: 126, y: 126, r: 10 },
  spawns: [
    { x: 14, y: 102, r: 12, zone: "ground" },
    { x: 14, y: 154, r: 12, zone: "ground" },
    { x: 242, y: 102, r: 12, zone: "ground" },
    { x: 242, y: 154, r: 12, zone: "ground" },
    { x: 18, y: 18, r: 8, zone: "air" },
    { x: 238, y: 238, r: 8, zone: "air" },
    { x: 128, y: 246, r: 9, zone: "water" },
  ],
  routes: [
    { spawn: 6, to: 11, layer: "water", width: [17, 23] },
    { spawn: 0, via: [9], width: [8, 15] },
    { spawn: 1, via: [9], width: [8, 15] },
    { spawn: 2, via: [10], width: [8, 15] },
    { spawn: 3, via: [10], width: [8, 15] },
  ],
  links: [
    // the north convoy road
    { rooms: [1, 2], width: [9, 13] }, { rooms: [2, 3], width: [9, 13] },
    { rooms: [3, 4], width: [9, 13] },
    // the south convoy road
    { rooms: [5, 6], width: [9, 13] }, { rooms: [6, 7], width: [9, 13] },
    { rooms: [7, 8], width: [9, 13] },
    // the roads hang off the two approaches at each end
    { rooms: [1, 9], width: [6, 9] }, { rooms: [5, 9], width: [6, 9] },
    { rooms: [4, 10], width: [6, 9] }, { rooms: [8, 10], width: [6, 9] },
  ],
  chokes: [{ x: 100, y: 128, w: 10, reach: 7 }, { x: 156, y: 128, w: 10, reach: 7 }],
  holes: 6, lumps: 14, ruins: 2, coreWaterReach: 110,
};

run(spec);
