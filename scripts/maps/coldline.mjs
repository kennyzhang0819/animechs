/**
 * Coldline
 *
 *   node scripts/maps/coldline.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: INTERCEPT THE CROSSER (docs/mission-design.md).
 *
 * WRITTEN BY THE GRAPH EDITOR (/admin/mapgraph). The graph it was drawn
 * from is scripts/maps/graphs/coldline.json — edit there and re-emit, or
 * edit the numbers here and the two drift apart.
 *
 * IT PAINTS NO SPAWN TILES. A graph says where the ground is and nothing
 * about where the swarm enters it, so the document this writes carries no
 * drop zones and the tiles are painted onto it in the map editor
 * afterwards. RE-RUNNING THIS FILE OVERWRITES THE DOCUMENT and takes them
 * with it. The pipeline and every rule are in mindustry.mjs; this file is
 * the numbers.
 */
import {
  run, FLOOR_ICE, FLOOR_SNOW, FLOOR_STONE, WALL_DACITE, WALL_ICE,
  WALL_SNOW,
} from "./mindustry.mjs";

/** a lake: pulls the water noise down round a point */
const well = (cx, cy, r, depth) => (x, y) =>
  -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));

export const spec = {
  id: "coldline",
  name: "Coldline",
  seed: 0xc01d,
  rock: { threshold: 0.45, scale: 26, warp: 14 },
  water: {
    scale: 62,
    level: 0.3,
    shore: 0.07,
    bias: (x, y) => 0.17 + well(128, 214, 15, 0.5)(x, y),
  },
  floors: {
    scale: 38, warp: 12,
    families: [
      { floor: FLOOR_SNOW, wall: WALL_SNOW, weight: 0.58 },
      { floor: FLOOR_ICE, wall: WALL_ICE, weight: 0.24 },
      { floor: FLOOR_STONE, wall: WALL_DACITE, weight: 0.18 },
    ],
  },
  beach: { floor: FLOOR_ICE, depth: 2 },
  flats: { floor: FLOOR_ICE, clear: 11 },
  rooms: [
    { x: 128, y: 128, r: 22, wobble: 0.24 }, // 0
    { x: 36, y: 70, r: 12 }, // 1
    { x: 94, y: 62, r: 12 }, // 2
    { x: 166, y: 64, r: 12 }, // 3
    { x: 222, y: 72, r: 12 }, // 4
    { x: 36, y: 186, r: 12 }, // 5
    { x: 94, y: 194, r: 12 }, // 6
    { x: 166, y: 192, r: 12 }, // 7
    { x: 222, y: 184, r: 12 }, // 8
    { x: 72, y: 128, r: 14 }, // 9
    { x: 184, y: 128, r: 14 }, // 10
    { x: 128, y: 174, r: 9, water: true }, // 11
    { x: 14, y: 102, r: 15, wobble: 0.2 }, // 12 ground entry
    { x: 14, y: 154, r: 15, wobble: 0.2 }, // 13 ground entry
    { x: 242, y: 102, r: 15, wobble: 0.2 }, // 14 ground entry
    { x: 242, y: 154, r: 15, wobble: 0.2 }, // 15 ground entry
    { x: 128, y: 246, r: 12, wobble: 0.15, water: true }, // 16 water entry
    { x: 126, y: 126, r: 10, wobble: 0.2 }, // 17 the core's own ground
  ],
  core: { x: 126, y: 126, r: 10 },
  spawns: [],
  routes: [],
  links: [
    { rooms: [16, 11], width: [17, 23], layer: "water" },
    { rooms: [12, 9], width: [8, 15] },
    { rooms: [9, 17], width: [8, 15] },
    { rooms: [13, 9], width: [8, 15] },
    { rooms: [9, 17], width: [8, 15] },
    { rooms: [14, 10], width: [8, 15] },
    { rooms: [10, 17], width: [8, 15] },
    { rooms: [15, 10], width: [8, 15] },
    { rooms: [10, 17], width: [8, 15] },
    { rooms: [1, 2], width: [9, 13] },
    { rooms: [2, 3], width: [9, 13] },
    { rooms: [3, 4], width: [9, 13] },
    { rooms: [5, 6], width: [9, 13] },
    { rooms: [6, 7], width: [9, 13] },
    { rooms: [7, 8], width: [9, 13] },
    { rooms: [1, 9], width: [6, 9] },
    { rooms: [5, 9], width: [6, 9] },
    { rooms: [4, 10], width: [6, 9] },
    { rooms: [8, 10], width: [6, 9] },
  ],
  chokes: [{ x: 100, y: 128, w: 10, reach: 7 }, { x: 156, y: 128, w: 10, reach: 7 }],
  holes: 6, lumps: 14, ruins: 2, coreWaterReach: 110,
};

run(spec);
