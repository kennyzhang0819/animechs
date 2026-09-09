/**
 * Greenwood — the earthy map. Dirt roads under dirt cliffs, grass with
 * stone outcrops, pine stands along every edge, two lakes. Four gates on
 * the west, south and north edges, the core in the north-east corner
 * behind one antechamber. Two rivers reach the mere below that
 * antechamber: one in off the east edge, one up from the south through
 * the lower lake.
 *
 *   node scripts/maps/greenwood.mjs [public/maps/greenwood.json] [preview.png]
 */
import {
  run, PINE, FLOOR_GRASS, FLOOR_DIRT, FLOOR_STONE, FLOOR_DARKSAND,
  WALL_DIRT, WALL_STONE,
} from "./mindustry.mjs";

const well = (cx, cy, r, depth) => (x, y) => -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
const wells = [well(100, 100, 14, 0.5), well(150, 190, 13, 0.45)];

export const spec = {
  id: "greenwood",
  name: "Greenwood",
  seed: 0x6e33,
  rock: { threshold: 0.45, scale: 24, warp: 12 },
  water: { scale: 60, level: 0.3, shore: 0.07, bias: (x, y) => 0.14 + wells.reduce((a, w) => a + w(x, y), 0) },
  floors: {
    scale: 36, warp: 12,
    families: [
      { floor: FLOOR_DIRT, wall: WALL_DIRT, weight: 0.5 },
      { floor: FLOOR_GRASS, wall: WALL_STONE, weight: 0.32 },
      { floor: FLOOR_STONE, wall: WALL_STONE, weight: 0.18 },
    ],
  },
  beach: { floor: FLOOR_DARKSAND, depth: 2 },
  rooms: [
    { x: 70, y: 76, r: 13 }, // 0 west clearing
    { x: 62, y: 172, r: 13 }, // 1 south-west clearing
    { x: 128, y: 124, r: 18 }, // 2 the glade every road meets in
    { x: 172, y: 172, r: 13 }, // 3 south-east
    { x: 150, y: 60, r: 12 }, // 4 north
    { x: 200, y: 74, r: 11 }, // 5 the antechamber
    { x: 206, y: 100, r: 9, water: true }, // 6 the mere below the antechamber
  ],
  core: { x: 232, y: 56, r: 9 },
  spawns: [
    { x: 24, y: 232, r: 12, zone: "ground" }, // 0
    { x: 16, y: 120, r: 12, zone: "ground" }, // 1
    { x: 124, y: 240, r: 12, zone: "ground" }, // 2
    { x: 60, y: 16, r: 12, zone: "ground" }, // 3
    { x: 12, y: 244, r: 8, zone: "air" },
    { x: 128, y: 250, r: 8, zone: "air" },
    // two rivers to the mere: one in off the east edge, one up from the
    // south through the lower lake
    { x: 242, y: 158, r: 9, zone: "water" }, // 6
    { x: 150, y: 242, r: 9, zone: "water" }, // 7
  ],
  routes: [
    { spawn: 6, to: 6, layer: "water", width: [16, 22] },
    { spawn: 7, to: 6, layer: "water", width: [16, 22] },
    { spawn: 0, via: [1, 2, 5], width: [8, 16] },
    { spawn: 1, via: [0, 2, 5], width: [8, 18] },
    { spawn: 2, via: [3, 2, 5], width: [8, 14] },
    { spawn: 3, via: [4, 5], width: [8, 14] },
  ],
  links: [
    { rooms: [0, 4], width: [7, 10] },
    { rooms: [1, 3], width: [7, 10] },
    { rooms: [2, 4], width: [7, 12] },
    { rooms: [2, 3], width: [7, 12] },
  ],
  chokes: [{ x: 216, y: 64, w: 9, reach: 8 }],
  funnel: { x: 216, y: 64, r: 8 },
  forest: { kind: PINE.pine, on: [FLOOR_GRASS, FLOOR_DIRT], threshold: 0.5, depth: 4 },
  holes: 6,
  lumps: 12,
  ruins: 2,
  coreWaterReach: 55,
};

run(spec);
