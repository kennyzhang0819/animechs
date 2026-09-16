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
    { x: 74, y: 70, r: 12 }, // 1
    { x: 70, y: 186, r: 12 }, // 2
    { x: 128, y: 52, r: 12 }, // 3
    { x: 132, y: 206, r: 12 }, // 4
    { x: 186, y: 128, r: 13 }, // 5
    { x: 182, y: 66, r: 9 }, // 6
    { x: 106, y: 214, r: 10 }, // 7
    { x: 96, y: 44, r: 10 }, // 8
    { x: 40, y: 176, r: 10 }, // 9
    { x: 28, y: 66, r: 9 }, // 10
    { x: 168, y: 190, r: 9, water: true }, // 11
    { x: 22, y: 90, r: 15 }, // 12 ground entry
    { x: 26, y: 220, r: 15 }, // 13 ground entry
    { x: 102, y: 16, r: 15 }, // 14 ground entry
    { x: 84, y: 240, r: 15 }, // 15 ground entry
    { x: 196, y: 244, r: 12, water: true }, // 16 water entry
    { x: 228, y: 128, r: 9, wobble: 0.2 }, // 17 the core's own ground
  ],
  core: { x: 228, y: 128, r: 9 },
  spawns: [],
  routes: [],
  links: [
    { rooms: [16, 11], width: [17, 23], layer: "water" },
    { rooms: [12, 1], width: [8, 16] },
    { rooms: [1, 0], width: [8, 16] },
    { rooms: [0, 5], width: [8, 16] },
    { rooms: [5, 17], width: [8, 16] },
    { rooms: [13, 2], width: [8, 15] },
    { rooms: [2, 0], width: [8, 15] },
    { rooms: [0, 5], width: [8, 15] },
    { rooms: [5, 17], width: [8, 15] },
    { rooms: [14, 3], width: [8, 15] },
    { rooms: [3, 0], width: [8, 15] },
    { rooms: [0, 5], width: [8, 15] },
    { rooms: [5, 17], width: [8, 15] },
    { rooms: [15, 4], width: [8, 15] },
    { rooms: [4, 0], width: [8, 15] },
    { rooms: [0, 5], width: [8, 15] },
    { rooms: [5, 17], width: [8, 15] },
    { rooms: [5, 6], width: [4, 5] },
    { rooms: [4, 7], width: [4, 5] },
    { rooms: [3, 8], width: [4, 5] },
    { rooms: [2, 9], width: [4, 5] },
    { rooms: [1, 10], width: [4, 5] },
    { rooms: [1, 3], width: [7, 10] },
    { rooms: [2, 4], width: [7, 10] },
  ],
  chokes: [{ x: 210, y: 128, w: 9, reach: 8 }, { x: 158, y: 128, w: 10, reach: 7 }, { x: 184, y: 97, w: 7, reach: 6 }, { x: 119, y: 210, w: 7, reach: 6 }, { x: 112, y: 48, w: 7, reach: 6 }, { x: 55, y: 181, w: 7, reach: 6 }, { x: 51, y: 68, w: 7, reach: 6 }],
  funnel: { x: 210, y: 128, r: 8 },
  holes: 5, lumps: 16, ruins: 3,
};

run(spec);
