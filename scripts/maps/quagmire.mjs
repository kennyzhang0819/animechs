/**
 * Quagmire — world 3, the spore swamp. Tainted lakes everywhere, a spore
 * river the hulls sail from the east lakes to the pool under the core,
 * and every ground road fords it: the amphibious front. Three ground
 * gates on the east side, the core on the west edge behind one causeway.
 *
 *   node scripts/maps/quagmire.mjs [public/maps/quagmire.json] [preview.png]
 */
import {
  run, PINE, FLOOR_MOSS, FLOOR_SPORE_MOSS, FLOOR_SHALE, FLOOR_MUD, FLOOR_DARKSAND,
  FLOOR_TAINTED_WATER, FLOOR_DEEP_TAINTED_WATER,
  WALL_SPORE, WALL_SHALE, WALL_DUNE,
} from "./mindustry.mjs";

const well = (cx, cy, r, depth) => (x, y) => -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
const pool = well(58, 150, 14, 0.4);

export const spec = {
  id: "quagmire",
  name: "Quagmire",
  seed: 0x51a9,
  rock: { threshold: 0.45, scale: 24, warp: 14 },
  water: {
    scale: 52, level: 0.42, shore: 0.09, warp: 20,
    shallow: FLOOR_TAINTED_WATER, deep: FLOOR_DEEP_TAINTED_WATER,
    // the west third, where the core stands, is the dry side
    bias: (x, y) => 0.06 + Math.max(0, (90 - x) / 90) * 0.18 + pool(x, y),
  },
  floors: {
    scale: 36, warp: 14,
    families: [
      { floor: FLOOR_MOSS, wall: WALL_SPORE, weight: 0.5 },
      { floor: FLOOR_DARKSAND, wall: WALL_DUNE, weight: 0.25 },
      { floor: FLOOR_SPORE_MOSS, wall: WALL_SPORE, weight: 0.15 },
      { floor: FLOOR_SHALE, wall: WALL_SHALE, weight: 0.1 },
    ],
  },
  beach: { floor: FLOOR_MUD, depth: 2 },
  rooms: [
    { x: 176, y: 100, r: 14 }, // 0 north-east clearing
    { x: 176, y: 160, r: 14 }, // 1 south-east clearing
    { x: 118, y: 128, r: 18 }, // 2 the crossroads
    { x: 66, y: 80, r: 12 }, // 3 north-west
    { x: 66, y: 176, r: 12 }, // 4 south-west
    { x: 52, y: 128, r: 11 }, // 5 the antechamber
    { x: 236, y: 60, r: 10, water: true }, // 6 north-east lake
    { x: 236, y: 196, r: 10, water: true }, // 7 south-east lake
    { x: 58, y: 150, r: 9, water: true }, // 8 the pool under the core
  ],
  core: { x: 22, y: 128, r: 9 },
  spawns: [
    { x: 236, y: 128, r: 12, zone: "ground" }, // 0
    { x: 200, y: 24, r: 12, zone: "ground" }, // 1
    { x: 200, y: 232, r: 12, zone: "ground" }, // 2
    { x: 236, y: 60, r: 10, zone: "water" }, // 3
    { x: 236, y: 196, r: 10, zone: "water" }, // 4
    { x: 246, y: 20, r: 8, zone: "air" },
    { x: 246, y: 236, r: 8, zone: "air" },
    { x: 248, y: 128, r: 4, zone: "boss" },
  ],
  routes: [
    { spawn: 0, via: [2, 5], width: [8, 16] },
    { spawn: 1, via: [0, 2, 5], width: [8, 16] },
    { spawn: 2, via: [1, 2, 5], width: [8, 16] },
    { spawn: 3, via: [0], to: 8, layer: "water", width: [12, 22] },
    { spawn: 4, via: [1], to: 8, layer: "water", width: [12, 22] },
  ],
  links: [
    { rooms: [0, 1], width: [7, 10] },
    { rooms: [2, 3], width: [7, 12] },
    { rooms: [2, 4], width: [7, 12] },
    { rooms: [3, 5], width: [7, 10] },
    { rooms: [4, 5], width: [7, 10] },
  ],
  chokes: [{ x: 36, y: 128, w: 9, reach: 8 }],
  funnel: { x: 36, y: 128, r: 8 },
  forest: { kind: PINE.sporePine, on: [FLOOR_MOSS, FLOOR_SPORE_MOSS], threshold: 0.52, depth: 4 },
  holes: 6,
  lumps: 12,
  ruins: 1,
  coreWaterReach: 45,
};

run(spec);
