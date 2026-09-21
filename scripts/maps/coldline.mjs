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
 * with it. The pipeline and every rule are in mapgen.mjs; this file is
 * the numbers.
 */
import {
  run, FLOOR_ICE, FLOOR_SNOW, FLOOR_STONE, WALL_DACITE, WALL_ICE,
  WALL_SNOW,
} from "./mapgen.mjs";

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
    { x: 68, y: 79, r: 12 }, // 1
    { x: 124, y: 69, r: 12 }, // 2
    { x: 164, y: 65, r: 12 }, // 3
    { x: 213, y: 69, r: 12 }, // 4
    { x: 64, y: 208, r: 12 }, // 5
    { x: 104, y: 175, r: 12 }, // 6
    { x: 159, y: 177, r: 12 }, // 7
    { x: 222, y: 184, r: 12 }, // 8
    { x: 72, y: 128, r: 14 }, // 9
    { x: 184, y: 128, r: 14 }, // 10
    { x: 135, y: 191, r: 9, water: true }, // 11
    { x: 231, y: 105, r: 15, wobble: 0.2 }, // 12 ground entry
    { x: 139, y: 252, r: 33, wobble: 0.15, water: true }, // 13 water entry
    { x: 14, y: 244, r: 22 }, // 14
    { x: 249, y: 222, r: 18 }, // 15
    { x: 252, y: 60, r: 12 }, // 16
    { x: 10, y: 62, r: 22 }, // 17
    { x: 164, y: 152, r: 12, water: true }, // 18
    { x: 173, y: 90, r: 12, water: true }, // 19
    { x: 171, y: 4, r: 30, water: true }, // 20
    { x: 126, y: 126, r: 10, wobble: 0.2 }, // 21 the core's own ground
  ],
  core: { x: 126, y: 126, r: 10 },
  spawns: [],
  routes: [],
  links: [
    { rooms: [13, 11], width: [17, 23], layer: "water" },
    { rooms: [9, 21], width: [8, 15] },
    { rooms: [9, 21], width: [8, 15] },
    { rooms: [12, 10], width: [8, 15] },
    { rooms: [10, 21], width: [8, 15] },
    { rooms: [10, 21], width: [8, 15] },
    { rooms: [1, 2], width: [9, 13] },
    { rooms: [2, 3], width: [9, 13] },
    { rooms: [3, 4], width: [9, 13] },
    { rooms: [5, 6], width: [9, 13] },
    { rooms: [6, 7], width: [16, 20] },
    { rooms: [7, 8], width: [9, 13] },
    { rooms: [4, 10], width: [6, 9] },
    { rooms: [8, 10], width: [6, 9] },
    { rooms: [14, 5], width: [8, 12] },
    { rooms: [17, 1], width: [8, 12] },
    { rooms: [4, 16], width: [8, 12] },
    { rooms: [8, 15], width: [8, 12] },
    { rooms: [20, 19], width: [16, 23], layer: "water" },
    { rooms: [19, 18], width: [8, 20], layer: "water" },
    { rooms: [2, 0], width: [8, 24] },
  ],
  chokes: [{ x: 100, y: 128, w: 10, reach: 7 }],
  holes: 6, lumps: 14, ruins: 2,
};

run(spec);
