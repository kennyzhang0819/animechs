/**
 * Sear
 *
 *   node scripts/maps/sear.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: VENTURE AND DESTROY (docs/mission-design.md).
 *
 * WRITTEN BY THE GRAPH EDITOR (/admin/mapgraph). The graph it was drawn
 * from is scripts/maps/graphs/sear.json — edit there and re-emit, or
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
  run, FLOOR_BASALT, FLOOR_DARKSAND, FLOOR_STONE, WALL_DACITE, WALL_DARK,
  WALL_DUNE,
} from "./mindustry.mjs";

/** a lake: pulls the water noise down round a point */
const well = (cx, cy, r, depth) => (x, y) =>
  -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));

export const spec = {
  id: "sear",
  name: "Sear",
  seed: 0x5ea1,
  rock: { threshold: 0.365, scale: 22, warp: 13 },
  water: {
    scale: 58,
    level: 0.3,
    shore: 0.07,
    bias: (x, y) => 0.18 + well(150, 196, 15, 0.5)(x, y),
  },
  floors: {
    scale: 34, warp: 12,
    families: [
      { floor: FLOOR_BASALT, wall: WALL_DARK, weight: 0.52 },
      { floor: FLOOR_DARKSAND, wall: WALL_DUNE, weight: 0.28 },
      { floor: FLOOR_STONE, wall: WALL_DACITE, weight: 0.2 },
    ],
  },
  beach: { floor: FLOOR_DARKSAND, depth: 2 },
  flats: { floor: FLOOR_DARKSAND, clear: 12 },
  rooms: [
    { x: 124, y: 128, r: 27, wobble: 0.24 }, // 0
    { x: 74, y: 73, r: 12 }, // 1
    { x: 63, y: 183, r: 18 }, // 2
    { x: 129, y: 55, r: 12 }, // 3
    { x: 112, y: 191, r: 12 }, // 4
    { x: 186, y: 128, r: 17 }, // 5
    { x: 214, y: 59, r: 22 }, // 6
    { x: 39, y: 55, r: 20 }, // 7
    { x: 168, y: 190, r: 9, water: true }, // 8
    { x: 22, y: 90, r: 15 }, // 9 ground entry
    { x: 38, y: 220, r: 25 }, // 10 ground entry
    { x: 70, y: 28, r: 15 }, // 11 ground entry
    { x: 82, y: 226, r: 26 }, // 12 ground entry
    { x: 196, y: 244, r: 12, water: true }, // 13 water entry
    { x: 228, y: 128, r: 16, wobble: 0.2 }, // 14 the core's own ground
  ],
  core: { x: 228, y: 128, r: 16 },
  spawns: [],
  routes: [],
  links: [
    { rooms: [13, 8], width: [17, 23], layer: "water" },
    { rooms: [9, 1], width: [8, 16] },
    { rooms: [1, 0], width: [8, 16] },
    { rooms: [0, 5], width: [8, 16] },
    { rooms: [5, 14], width: [8, 16] },
    { rooms: [10, 2], width: [8, 15] },
    { rooms: [2, 0], width: [8, 15] },
    { rooms: [0, 5], width: [8, 15] },
    { rooms: [5, 14], width: [8, 15] },
    { rooms: [11, 3], width: [8, 15] },
    { rooms: [3, 0], width: [8, 15] },
    { rooms: [0, 5], width: [8, 15] },
    { rooms: [5, 14], width: [8, 15] },
    { rooms: [12, 4], width: [8, 15] },
    { rooms: [4, 0], width: [8, 15] },
    { rooms: [0, 5], width: [8, 15] },
    { rooms: [5, 14], width: [8, 15] },
    { rooms: [5, 6], width: [4, 16] },
    { rooms: [1, 7], width: [4, 5] },
    { rooms: [1, 3], width: [7, 10] },
    { rooms: [2, 4], width: [7, 10] },
  ],
  chokes: [],
  funnel: { x: 210, y: 128, r: 8 },
  holes: 3, lumps: 11, ruins: 2,
};

run(spec);
