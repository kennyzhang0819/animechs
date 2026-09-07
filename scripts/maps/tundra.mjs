/**
 * Tundra — the snowy map. Snow under snow walls, ice round two frozen
 * lakes, shale where the rock breaks through, snow pines. Four gates on
 * the south corners and the east and west edges, the core on the north
 * edge behind one antechamber.
 *
 *   node scripts/maps/tundra.mjs [public/maps/tundra.json] [preview.png]
 */
import {
  run, PINE, FLOOR_SNOW, FLOOR_ICE, FLOOR_SHALE,
  WALL_SNOW, WALL_ICE, WALL_SHALE,
} from "./mindustry.mjs";

const well = (cx, cy, r, depth) => (x, y) => -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
const wells = [well(80, 150, 15, 0.5), well(176, 118, 12, 0.45)];

export const spec = {
  id: "tundra",
  name: "Tundra",
  seed: 0x7a11,
  rock: { threshold: 0.43, scale: 26, warp: 12 },
  water: { scale: 60, level: 0.3, shore: 0.07, bias: (x, y) => 0.15 + wells.reduce((a, w) => a + w(x, y), 0) },
  floors: {
    scale: 36, warp: 12,
    families: [
      { floor: FLOOR_SNOW, wall: WALL_SNOW, weight: 0.6 },
      { floor: FLOOR_SHALE, wall: WALL_SHALE, weight: 0.25 },
      { floor: FLOOR_ICE, wall: WALL_ICE, weight: 0.15 },
    ],
  },
  beach: { floor: FLOOR_ICE, wall: WALL_ICE, depth: 3 },
  rooms: [
    { x: 64, y: 160, r: 14 }, // 0 south-west
    { x: 192, y: 160, r: 14 }, // 1 south-east
    { x: 128, y: 128, r: 18 }, // 2 the frozen basin
    { x: 56, y: 96, r: 12 }, // 3 west
    { x: 200, y: 96, r: 12 }, // 4 east
    { x: 128, y: 58, r: 11 }, // 5 the antechamber
  ],
  core: { x: 128, y: 24, r: 9 },
  spawns: [
    { x: 24, y: 232, r: 12, zone: "ground" }, // 0
    { x: 232, y: 232, r: 12, zone: "ground" }, // 1
    { x: 16, y: 128, r: 12, zone: "ground" }, // 2
    { x: 240, y: 128, r: 12, zone: "ground" }, // 3
    { x: 12, y: 244, r: 8, zone: "air" },
    { x: 244, y: 244, r: 8, zone: "air" },
    { x: 128, y: 250, r: 4, zone: "boss" },
  ],
  routes: [
    { spawn: 0, via: [0, 2, 5], width: [8, 16] },
    { spawn: 1, via: [1, 2, 5], width: [8, 16] },
    { spawn: 2, via: [3, 2, 5], width: [8, 14] },
    { spawn: 3, via: [4, 2, 5], width: [8, 14] },
  ],
  links: [
    { rooms: [0, 3], width: [7, 10] },
    { rooms: [1, 4], width: [7, 10] },
    { rooms: [0, 1], width: [7, 12] },
  ],
  chokes: [{ x: 128, y: 40, w: 9, reach: 8 }],
  funnel: { x: 128, y: 40, r: 8 },
  forest: { kind: PINE.snowPine, on: [FLOOR_SNOW], threshold: 0.53, depth: 4 },
  holes: 6,
  lumps: 12,
  ruins: 2,
  coreWaterReach: 999,
};

run(spec);
