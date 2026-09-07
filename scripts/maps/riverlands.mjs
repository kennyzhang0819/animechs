/**
 * Riverlands — the core in the middle of the board with three rivers
 * running to the pool beside it: the hulls sail in from the west, east
 * and south edges, and five ground gates come at it from the north and
 * the four corners, fording the rivers on the way. No funnel.
 *
 *   node scripts/maps/riverlands.mjs [public/maps/riverlands.json] [preview.png]
 */
import {
  run, PINE, FLOOR_GRASS, FLOOR_DIRT, FLOOR_SAND,
  WALL_STONE, WALL_DIRT, WALL_SAND,
} from "./mindustry.mjs";

const well = (cx, cy, r, depth) => (x, y) => -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
const pool = well(128, 152, 12, 0.5);

export const spec = {
  id: "riverlands",
  name: "Riverlands",
  seed: 0x21e5,
  rock: { threshold: 0.43, scale: 24, warp: 12 },
  // dry everywhere but the pool: the rivers are carved, not found
  water: { scale: 60, level: 0.28, shore: 0.07, bias: (x, y) => 0.18 + pool(x, y) },
  floors: {
    scale: 36, warp: 12,
    families: [
      { floor: FLOOR_GRASS, wall: WALL_STONE, weight: 0.45 },
      { floor: FLOOR_DIRT, wall: WALL_DIRT, weight: 0.3 },
      { floor: FLOOR_SAND, wall: WALL_SAND, weight: 0.25 },
    ],
  },
  beach: { floor: FLOOR_SAND, wall: WALL_SAND, depth: 3 },
  rooms: [
    { x: 128, y: 44, r: 10 }, // 0 north, off the road
    { x: 60, y: 60, r: 12 }, // 1 north-west
    { x: 196, y: 60, r: 12 }, // 2 north-east
    { x: 60, y: 196, r: 12 }, // 3 south-west
    { x: 196, y: 196, r: 12 }, // 4 south-east
    { x: 128, y: 152, r: 10, water: true }, // 5 the pool the rivers meet in
    { x: 72, y: 124, r: 11 }, // 6 west
    { x: 184, y: 124, r: 11 }, // 7 east
  ],
  core: { x: 128, y: 116, r: 10 },
  spawns: [
    { x: 128, y: 16, r: 12, zone: "ground" }, // 0
    { x: 24, y: 24, r: 12, zone: "ground" }, // 1
    { x: 232, y: 24, r: 12, zone: "ground" }, // 2
    { x: 24, y: 232, r: 12, zone: "ground" }, // 3
    { x: 232, y: 232, r: 12, zone: "ground" }, // 4
    { x: 14, y: 152, r: 9, zone: "water" }, // 5 the west river
    { x: 242, y: 152, r: 9, zone: "water" }, // 6 the east river
    { x: 128, y: 242, r: 9, zone: "water" }, // 7 the south river
    { x: 12, y: 128, r: 8, zone: "air" },
    { x: 244, y: 128, r: 8, zone: "air" },
  ],
  routes: [
    { spawn: 5, to: 5, layer: "water", width: [16, 22] },
    { spawn: 6, to: 5, layer: "water", width: [16, 22] },
    { spawn: 7, to: 5, layer: "water", width: [16, 22] },
    { spawn: 0, via: [0, 1, 6], width: [8, 14] },
    { spawn: 1, via: [1, 6], width: [8, 14] },
    { spawn: 2, via: [2, 7], width: [8, 14] },
    { spawn: 3, via: [3, 6], width: [8, 14] },
    { spawn: 4, via: [4, 7], width: [8, 14] },
  ],
  links: [
    { rooms: [0, 2], width: [7, 10] },
    { rooms: [3, 4], width: [7, 10] },
  ],
  chokes: [
    { x: 128, y: 92, w: 9, reach: 7 },
    { x: 100, y: 122, w: 9, reach: 7 },
    { x: 156, y: 122, w: 9, reach: 7 },
  ],
  forest: { kind: PINE.pine, on: [FLOOR_GRASS], threshold: 0.55, depth: 4 },
  holes: 6,
  lumps: 12,
  ruins: 2,
  coreWaterReach: 40,
};

run(spec);
